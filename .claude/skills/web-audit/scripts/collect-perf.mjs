#!/usr/bin/env node
// Passive performance collector: loads pages in a real Chromium with a cold
// cache and a throttled profile, records Core Web Vitals plus the diagnostics
// that explain them, and writes perf.json.
//
//   node collect-perf.mjs <url...> --out DIR [--runs 3] [--profile mobile|desktop]
//                                  [--all-profiles] [--timeout 60000]
//
// Makes only the requests an ordinary visitor's browser makes. See
// references/security.md for why that boundary matters.

import path from 'node:path';
import {
  parseArgs, writeJson, finding, findChromium, assertPassiveTarget, loadPlaywright,
  median, kb, ms, summarise, bySeverityThenEffort,
} from './_lib.mjs';

const PROFILES = {
  mobile: {
    label: 'Moto G-class Android, 4G',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; moto g play) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    cpuThrottle: 4,
    network: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  },
  desktop: {
    label: 'Desktop, unthrottled',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent: undefined,
    cpuThrottle: 1,
    network: null,
  },
};

// Core Web Vitals thresholds (good / needs-improvement boundary), in ms except CLS.
const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  tbt: { good: 200, poor: 600 },
  cls: { good: 0.1, poor: 0.25 },
};

const IN_PAGE_INIT = `
  window.__audit = { lcp: 0, cls: 0, shifts: [], longTasks: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__audit.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__audit.cls += e.value;
        if (e.value > 0.01) window.__audit.shifts.push({ value: e.value, at: e.startTime });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__audit.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
`;

// Runs in the page after load. Reads timings and inspects the DOM for the
// things that usually explain a bad number.
const IN_PAGE_COLLECT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
  const a = window.__audit || { lcp: 0, cls: 0, shifts: [], longTasks: [] };
  const fcp = paint['first-contentful-paint'] || 0;
  const tbt = a.longTasks
    .filter((t) => t.start >= fcp)
    .reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0);

  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };

  const renderBlocking = [];
  for (const el of document.querySelectorAll('head link[rel="stylesheet"], head script[src]')) {
    if (el.tagName === 'SCRIPT' && (el.defer || el.async || el.type === 'module')) continue;
    if (el.tagName === 'LINK' && el.media && el.media !== 'all' && !matchMedia(el.media).matches) continue;
    renderBlocking.push({ tag: el.tagName.toLowerCase(), url: abs(el.src || el.href) });
  }

  const images = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (!img.currentSrc && !img.src) continue;
    images.push({
      url: abs(img.currentSrc || img.src),
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      rendered: { w: Math.round(r.width), h: Math.round(r.height) },
      hasDimensions: Boolean((img.getAttribute('width') && img.getAttribute('height')) ||
        getComputedStyle(img).aspectRatio !== 'auto'),
      loading: img.getAttribute('loading'),
      inViewport: r.top < innerHeight && r.bottom > 0 && r.width > 0,
    });
  }

  let lcpEl = null;
  try {
    const e = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
    if (e) lcpEl = { tag: e.element?.tagName || null, url: e.url || null, size: e.size };
  } catch {}

  const fonts = [];
  try { for (const f of document.fonts) fonts.push({ family: f.family, weight: f.weight, display: f.display, status: f.status }); } catch {}

  return {
    metrics: {
      ttfb: (nav.responseStart || 0) - (nav.requestStart || 0) > 0 ? nav.responseStart - nav.requestStart : nav.responseStart || 0,
      fcp,
      lcp: a.lcp || fcp,
      cls: Number(a.cls.toFixed(4)),
      tbt: Math.round(tbt),
      domContentLoaded: nav.domContentLoadedEventEnd || 0,
      load: nav.loadEventEnd || 0,
      transferSize: nav.transferSize || 0,
    },
    lcpElement: lcpEl,
    renderBlocking,
    images,
    fonts,
    shifts: a.shifts.slice(0, 10),
    longTasks: a.longTasks.sort((x, y) => y.duration - x.duration).slice(0, 5),
    scriptCount: document.querySelectorAll('script[src]').length,
    title: document.title,
  };
})()`;

const TEXT_TYPES = /^(text\/|application\/(javascript|json|xml|x-javascript)|image\/svg)/;

function resourceKind(contentType = '', url = '') {
  const ct = contentType.split(';')[0];
  if (/javascript|ecmascript/.test(ct) || /\.m?js(\?|$)/.test(url)) return 'script';
  if (/css/.test(ct) || /\.css(\?|$)/.test(url)) return 'stylesheet';
  if (/^image\//.test(ct)) return 'image';
  if (/^font\/|font-woff|\.woff2?(\?|$)/.test(ct + url)) return 'font';
  if (/html/.test(ct)) return 'document';
  if (/json|xml/.test(ct)) return 'data';
  return 'other';
}

async function runOnce(browser, url, profile, timeout, screenshotPrefix) {
  const p = PROFILES[profile];
  const context = await browser.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.deviceScaleFactor,
    isMobile: p.isMobile,
    hasTouch: p.hasTouch,
    userAgent: p.userAgent,
    ignoreHTTPSErrors: false,
    bypassCSP: false,
  });
  await context.addInitScript(IN_PAGE_INIT);
  const page = await context.newPage();

  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true }); // cold cache, every run
  if (p.network) await client.send('Network.emulateNetworkConditions', { offline: false, ...p.network });
  if (p.cpuThrottle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: p.cpuThrottle });

  const resources = [];
  page.on('response', async (res) => {
    try {
      const req = res.request();
      const headers = await res.allHeaders().catch(() => ({}));
      let sizes = { responseBodySize: 0, responseHeadersSize: 0 };
      try { sizes = await req.sizes(); } catch {}
      resources.push({
        url: res.url(),
        status: res.status(),
        kind: resourceKind(headers['content-type'] || '', res.url()),
        contentType: (headers['content-type'] || '').split(';')[0],
        encoding: headers['content-encoding'] || null,
        cacheControl: headers['cache-control'] || null,
        transfer: (sizes.responseBodySize || 0) + (sizes.responseHeadersSize || 0),
        body: sizes.responseBodySize || 0,
        thirdParty: new URL(res.url()).host !== new URL(url).host,
        fromCache: res.fromServiceWorker?.() || false,
      });
    } catch {}
  });

  let response;
  let navError = null;
  try {
    response = await page.goto(url, { waitUntil: 'load', timeout });
    // Let late work (lazy images, hydration, deferred scripts) settle so LCP
    // and CLS reflect what the visitor sees, not just the load event.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } catch (err) {
    navError = String(err.message || err);
  }

  const redirects = [];
  if (response) {
    let r = response.request().redirectedFrom();
    while (r) { redirects.unshift({ url: r.url(), status: r.response() ? (await r.response()).status() : null }); r = r.redirectedFrom(); }
  }

  let data = null;
  // Playwright evaluates a string as a JS *expression* and returns its value —
  // it does not call a function the string evaluates to. So the collector is
  // written as an immediately-invoked function.
  if (!navError) data = await page.evaluate(IN_PAGE_COLLECT).catch((e) => ({ error: String(e) }));

  if (screenshotPrefix && !navError) {
    await page.screenshot({ path: `${screenshotPrefix}-${profile}-above-fold.png` }).catch(() => {});
    await page.screenshot({ path: `${screenshotPrefix}-${profile}-full.png`, fullPage: true }).catch(() => {});
  }

  await context.close();
  return {
    navError,
    status: response ? response.status() : null,
    redirects,
    resources,
    ...(data || {}),
  };
}

function analyse(url, profile, runs) {
  const findings = [];
  const ok = runs.filter((r) => !r.navError && r.metrics);
  if (!ok.length) {
    return {
      findings: [finding({
        id: `perf-unreachable-${profile}`,
        title: `Page could not be loaded (${profile} profile)`,
        severity: 'high', category: 'performance', effort: 'moderate', url,
        evidence: runs[0]?.navError || 'navigation failed',
        impact: 'The page did not finish loading within the timeout under a throttled mobile connection. Visitors on slower connections may be seeing the same thing.',
        fix: 'Reproduce with the same command and profile, then investigate whether the failure is a timeout, a server error or a resource that never resolves.',
      })],
      metrics: null,
    };
  }

  const m = {};
  for (const key of Object.keys(THRESHOLDS)) m[key] = median(ok.map((r) => r.metrics[key]));
  const last = ok[ok.length - 1];
  const res = last.resources;
  const label = PROFILES[profile].label;
  const runNote = `median of ${ok.length} cold load${ok.length > 1 ? 's' : ''}, ${label}`;

  const rate = (key, v) => (v <= THRESHOLDS[key].good ? 'good' : v <= THRESHOLDS[key].poor ? 'needs-work' : 'poor');
  const fmt = (key, v) => (key === 'cls' ? v.toFixed(3) : ms(v));

  // --- Core Web Vitals ------------------------------------------------------
  for (const [key, name] of [['lcp', 'Main content takes too long to appear'], ['cls', 'Page content shifts while loading'], ['tbt', 'Page freezes while scripts run'], ['ttfb', 'Server is slow to respond']]) {
    const v = m[key];
    if (v == null || rate(key, v) === 'good') continue;
    const poor = rate(key, v) === 'poor';
    const detail = {
      lcp: {
        impact: `On ${label}, the largest thing on screen finishes drawing after ${fmt('lcp', v)}. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.`,
        fix: 'Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.',
      },
      cls: {
        impact: `Content moves by ${v.toFixed(3)} of the screen after it first appears, which is what makes people tap the wrong thing. Google treats anything over 0.1 as poor.`,
        fix: 'Reserve space for anything that arrives late: width and height attributes (or aspect-ratio) on every image, a fixed height for ad and embed slots, and font-display settings that do not swap in a differently-sized face.',
      },
      tbt: {
        impact: `The page is unresponsive to taps and clicks for about ${fmt('tbt', v)} while JavaScript runs. On a mid-range phone this reads as the site being broken rather than slow.`,
        fix: 'Reduce and defer JavaScript: split bundles by route, load non-essential third-party scripts after interaction, and move heavy work off the main thread or to the server.',
      },
      ttfb: {
        impact: `The server takes ${fmt('ttfb', v)} to send the first byte, before the browser can begin any work at all. Everything else on the page is delayed by this amount.`,
        fix: 'Cache the response at the edge where the page allows it, check for per-request database work that could be cached or batched, and check whether a serverless cold start is responsible.',
      },
    }[key];
    findings.push(finding({
      id: `perf-${key}-${profile}`,
      title: `${name} (${key.toUpperCase()} ${fmt(key, v)})`,
      severity: poor ? 'high' : 'medium',
      category: 'performance', effort: key === 'ttfb' ? 'moderate' : 'quick', url,
      evidence: `${key.toUpperCase()} ${fmt(key, v)} — ${runNote}. Threshold for "good" is ${key === 'cls' ? THRESHOLDS[key].good : ms(THRESHOLDS[key].good)}.`,
      ...detail,
    }));
  }

  // --- Uncompressed text responses -----------------------------------------
  const uncompressed = res.filter((r) => !r.encoding && r.body > 2048 && TEXT_TYPES.test(r.contentType));
  if (uncompressed.length) {
    const total = uncompressed.reduce((s, r) => s + r.body, 0);
    findings.push(finding({
      id: 'perf-no-compression',
      title: `${uncompressed.length} text file(s) are served without compression`,
      severity: total > 200 * 1024 ? 'high' : 'medium',
      category: 'performance', effort: 'quick', url,
      evidence: uncompressed.slice(0, 5).map((r) => `${r.url} — ${kb(r.body)}, no content-encoding`).join('\n') +
        `\n(${kb(total)} uncompressed in total)`,
      impact: `Roughly ${kb(total)} is sent uncompressed on every visit. Text compresses by about three to four times, so most of this is downloaded for nothing — on a mobile connection that is seconds.`,
      fix: 'Enable gzip or Brotli for text content types at the CDN or web server. This is a configuration change with no code impact.',
    }));
  }

  // --- Cache headers on static assets --------------------------------------
  const hashed = res.filter((r) => /[.-][0-9a-f]{8,}\.(js|css|woff2?|png|jpe?g|webp|avif|svg)/i.test(r.url) || /\/_next\/static\//.test(r.url));
  const badCache = hashed.filter((r) => !r.cacheControl || /no-store|no-cache|max-age=0/.test(r.cacheControl) || !/max-age=\d{5,}/.test(r.cacheControl));
  if (badCache.length) {
    findings.push(finding({
      id: 'perf-cache-headers',
      title: `${badCache.length} build asset(s) are not cached by the browser`,
      severity: 'medium', category: 'performance', effort: 'quick', url,
      evidence: badCache.slice(0, 5).map((r) => `${r.url} — cache-control: ${r.cacheControl || '(none)'}`).join('\n'),
      impact: 'These files have a content hash in their name, so they can never change without the name changing — they are safe to cache forever. As configured, returning visitors re-download them on every visit.',
      fix: 'Serve hashed build assets with `Cache-Control: public, max-age=31536000, immutable`. This does not affect first-time visitors, and does not change what is deployed.',
    }));
  }

  // --- Render-blocking ------------------------------------------------------
  const rb = last.renderBlocking || [];
  if (rb.length > 2) {
    const rbBytes = rb.reduce((s, x) => s + (res.find((r) => r.url === x.url)?.transfer || 0), 0);
    findings.push(finding({
      id: 'perf-render-blocking',
      title: `${rb.length} files block the page from drawing anything`,
      severity: rb.length > 5 ? 'medium' : 'low',
      category: 'performance', effort: 'quick', url,
      evidence: rb.slice(0, 6).map((x) => `<${x.tag}> ${x.url}`).join('\n') + `\n(~${kb(rbBytes)} total, must download and run before the page appears)`,
      impact: 'The browser will not show anything until all of these have downloaded and been processed. On a slow connection this is the whole of the time the visitor spends looking at a blank page.',
      fix: 'Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.',
    }));
  }

  // --- JavaScript weight ----------------------------------------------------
  const scripts = res.filter((r) => r.kind === 'script');
  const jsBytes = scripts.reduce((s, r) => s + r.transfer, 0);
  if (jsBytes > 300 * 1024) {
    const third = scripts.filter((r) => r.thirdParty).reduce((s, r) => s + r.transfer, 0);
    const top = [...scripts].sort((a, b) => b.transfer - a.transfer).slice(0, 5);
    findings.push(finding({
      id: 'perf-js-weight',
      title: `${kb(jsBytes)} of JavaScript downloaded on one page view`,
      severity: jsBytes > 800 * 1024 ? 'high' : 'medium',
      category: 'performance', effort: 'involved', url,
      evidence: top.map((r) => `${kb(r.transfer)}  ${r.url}${r.thirdParty ? '  (third-party)' : ''}`).join('\n') +
        (third ? `\n${kb(third)} of the total is third-party code.` : ''),
      impact: `Every visit downloads, parses and runs ${kb(jsBytes)} of code before the page is fully usable. On a mid-range phone the parsing alone costs noticeable time, and it is the usual cause of the page feeling frozen.`,
      fix: 'Split the bundle by route so a page only loads its own code, import individual components rather than whole libraries, load charting and editor libraries on demand, and move third-party tags behind a delay or remove the ones nobody reads.',
    }));
  }

  // --- Images ---------------------------------------------------------------
  const imgs = last.images || [];
  const oversized = imgs.filter((i) => i.rendered.w > 0 && i.natural.w > i.rendered.w * 2)
    .map((i) => ({ ...i, bytes: res.find((r) => r.url === i.url)?.transfer || 0 }))
    .sort((a, b) => b.bytes - a.bytes);
  if (oversized.length) {
    const waste = oversized.reduce((s, i) => s + i.bytes, 0);
    findings.push(finding({
      id: 'perf-oversized-images',
      title: `${oversized.length} image(s) are far larger than the space they are shown in`,
      severity: waste > 500 * 1024 ? 'high' : 'medium',
      category: 'performance', effort: 'quick', url,
      evidence: oversized.slice(0, 5).map((i) => `${i.url}\n    ${i.natural.w}×${i.natural.h} delivered, drawn at ${i.rendered.w}×${i.rendered.h}${i.bytes ? `, ${kb(i.bytes)}` : ''}`).join('\n'),
      impact: `About ${kb(waste)} is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.`,
      fix: 'Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.',
    }));
  }
  const noDims = imgs.filter((i) => !i.hasDimensions && i.rendered.w > 50);
  if (noDims.length && m.cls > THRESHOLDS.cls.good) {
    findings.push(finding({
      id: 'perf-image-dimensions',
      title: `${noDims.length} image(s) have no reserved space, so the page jumps`,
      severity: 'medium', category: 'performance', effort: 'quick', url,
      evidence: noDims.slice(0, 5).map((i) => `${i.url} — no width/height attributes or aspect-ratio`).join('\n') +
        `\nMeasured layout shift: ${m.cls.toFixed(3)} (good is under ${THRESHOLDS.cls.good}).`,
      impact: 'The browser cannot reserve space for an image until it has downloaded, so everything below it moves down when it arrives. This is what makes a visitor tap the wrong link.',
      fix: 'Add `width` and `height` attributes to every `<img>`, or set `aspect-ratio` in CSS. The values only need the correct ratio, not the display size.',
    }));
  }
  const legacy = imgs.map((i) => res.find((r) => r.url === i.url)).filter((r) => r && /image\/(png|jpeg)/.test(r.contentType) && r.transfer > 100 * 1024);
  if (legacy.length) {
    findings.push(finding({
      id: 'perf-image-format',
      title: `${legacy.length} large image(s) use an older format`,
      severity: 'low', category: 'performance', effort: 'quick', url,
      evidence: legacy.slice(0, 5).map((r) => `${r.url} — ${r.contentType}, ${kb(r.transfer)}`).join('\n'),
      impact: 'WebP and AVIF typically produce the same visible quality at a quarter to a half of the file size. Every browser in use today supports WebP.',
      fix: 'Convert these to WebP (or AVIF with a WebP fallback), or serve them through an image CDN that negotiates the format per browser.',
    }));
  }

  // --- Fonts ----------------------------------------------------------------
  const fontRes = res.filter((r) => r.kind === 'font');
  const fontBytes = fontRes.reduce((s, r) => s + r.transfer, 0);
  const blockingFonts = (last.fonts || []).filter((f) => f.display === 'auto' || f.display === 'block');
  if (fontRes.length > 3 || fontBytes > 200 * 1024 || blockingFonts.length) {
    findings.push(finding({
      id: 'perf-fonts',
      title: `${fontRes.length} web font file(s), ${kb(fontBytes)}${blockingFonts.length ? ', text hidden while they load' : ''}`,
      severity: 'low', category: 'performance', effort: 'quick', url,
      evidence: fontRes.slice(0, 5).map((r) => `${r.url} — ${kb(r.transfer)}`).join('\n') +
        (blockingFonts.length ? `\n${blockingFonts.length} font face(s) use font-display: ${blockingFonts[0].display}, which hides text until the font arrives.` : ''),
      impact: 'Each font weight is a separate download on the critical path. Where font-display is not set to swap, the browser shows nothing where the text should be — for up to three seconds on a slow connection.',
      fix: 'Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.',
    }));
  }

  // --- Redirects ------------------------------------------------------------
  if (last.redirects?.length >= 2) {
    findings.push(finding({
      id: 'perf-redirect-chain',
      title: `The page is reached through ${last.redirects.length} redirects`,
      severity: 'low', category: 'performance', effort: 'quick', url,
      evidence: last.redirects.map((r) => `${r.status || '???'} ${r.url}`).join('\n  → ') + `\n  → ${url}`,
      impact: 'Each redirect is a full network round trip before the real page begins loading. On a mobile connection with 150 ms of latency, this delays everything by roughly half a second.',
      fix: 'Collapse the chain to a single redirect at the edge — go straight from the original URL to the final one rather than through http, then www, then the page.',
    }));
  }

  // --- Errors ---------------------------------------------------------------
  const failed = res.filter((r) => r.status >= 400);
  if (failed.length) {
    findings.push(finding({
      id: 'perf-failed-requests',
      title: `${failed.length} request(s) on the page fail`,
      severity: failed.some((r) => r.status >= 500) ? 'medium' : 'low',
      category: 'best-practice', effort: 'quick', url,
      evidence: failed.slice(0, 6).map((r) => `${r.status} ${r.url}`).join('\n'),
      impact: 'Each failed request costs a round trip and may leave something on the page missing or broken. A 404 for an asset is usually a deployment that left a reference behind.',
      fix: 'Remove or correct the references. Where the file should exist, check whether it is missing from the deployed build.',
    }));
  }

  return {
    metrics: {
      ...m,
      rating: Object.fromEntries(Object.keys(THRESHOLDS).map((k) => [k, m[k] == null ? null : rate(k, m[k])])),
      runs: ok.length,
      profile, profileLabel: label,
    },
    resourceSummary: summariseResources(res),
    lcpElement: last.lcpElement,
    findings,
  };
}

function summariseResources(res) {
  const byKind = {};
  for (const r of res) {
    const k = (byKind[r.kind] ||= { count: 0, transfer: 0, thirdPartyTransfer: 0 });
    k.count++;
    k.transfer += r.transfer;
    if (r.thirdParty) k.thirdPartyTransfer += r.transfer;
  }
  return {
    byKind,
    totalRequests: res.length,
    totalTransfer: res.reduce((s, r) => s + r.transfer, 0),
    thirdPartyTransfer: res.filter((r) => r.thirdParty).reduce((s, r) => s + r.transfer, 0),
    thirdPartyHosts: [...new Set(res.filter((r) => r.thirdParty).map((r) => new URL(r.url).host))],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = args._.map(assertPassiveTarget).map(String);
  if (!urls.length) {
    console.error('usage: collect-perf.mjs <url...> --out DIR [--runs 3] [--profile mobile|desktop] [--all-profiles]');
    process.exit(1);
  }
  const outDir = args.out || path.join(process.cwd(), 'audit-out');
  const runCount = Number(args.runs || 3);
  const timeout = Number(args.timeout || 60000);
  const profiles = args['all-profiles'] ? ['mobile', 'desktop'] : [args.profile || 'mobile'];
  for (const p of profiles) if (!PROFILES[p]) throw new Error(`unknown profile: ${p}`);

  const executablePath = findChromium();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const pages = [];
  const allFindings = [];
  try {
    for (const url of urls) {
      const slug = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').slice(0, 60);
      const entry = { url, profiles: {} };
      for (const profile of profiles) {
        process.stderr.write(`  ${url} [${profile}] `);
        const runs = [];
        for (let i = 0; i < runCount; i++) {
          runs.push(await runOnce(browser, url, profile, timeout, i === 0 ? path.join(outDir, 'screenshots', slug) : null));
          process.stderr.write('.');
        }
        process.stderr.write('\n');
        const result = analyse(url, profile, runs);
        entry.profiles[profile] = result;
        // Only the primary profile contributes findings, so a two-profile run
        // does not report every problem twice.
        if (profile === profiles[0]) allFindings.push(...result.findings);
      }
      pages.push(entry);
    }
  } finally {
    await browser.close();
  }

  const findings = allFindings.sort(bySeverityThenEffort);
  const file = writeJson(outDir, 'perf', {
    tool: 'collect-perf', collectedAt: new Date().toISOString(),
    command: `node collect-perf.mjs ${urls.join(' ')} --runs ${runCount} --profile ${profiles.join(',')}`,
    urls, runs: runCount, profiles, pages, findings,
  });

  for (const p of pages) {
    const m = p.profiles[profiles[0]].metrics;
    if (m) console.log(`\n${p.url}\n  LCP ${ms(m.lcp)} · CLS ${m.cls.toFixed(3)} · TBT ${ms(m.tbt)} · TTFB ${ms(m.ttfb)}  (${m.profileLabel})`);
  }
  summarise('Performance', findings);
  console.log(`\nWrote ${file}`);
  console.log(`Screenshots in ${path.join(outDir, 'screenshots')} — look at them before writing the report.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
