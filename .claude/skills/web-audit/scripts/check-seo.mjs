#!/usr/bin/env node
// Technical SEO collector. Loads each page in a real browser and reads what a
// search engine reads: the head tags, the heading outline, the indexability
// directives, and the links the page publishes.
//
//   node check-seo.mjs <url...> --out DIR [--timeout 30000] [--max-links 30] [--no-links]
//                       [--no-sitemap]
//
// PASSIVE ONLY, BY DESIGN, keeping the same boundary as the other collectors.
// It requests the URLs given, `/robots.txt`, the sitemap those declare (unless
// --no-sitemap), and (unless --no-links) the same-origin URLs those pages
// themselves link to, honouring robots.txt as it goes. It does not guess
// paths, submit forms or send payloads. Following a link the site publishes is
// what every crawler and every visitor does; guessing one is not, and neither
// is reading a sitemap the site advertises. Do not add an active mode here.
//
// Severity here follows SKILL.md §2: consequence to the business, not rule
// count. A live page carrying `noindex` is critical because it is invisible in
// search; a title three characters over the truncation point is low.

import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  parseArgs, writeJson, finding, findChromium, assertPassiveTarget, loadPlaywright,
  summarise, bySeverityThenEffort,
} from './_lib.mjs';

// Google truncates the blue link around 580px, which is ~60 characters at
// typical width. Under ~15 and there is usually nothing to rank on.
const TITLE_MAX = 60;
const TITLE_MIN = 15;
const META_MAX = 160;
const META_MIN = 50;
// Below this a page rarely answers the query it ranks for. Judgement-dependent,
// so it is reported `unconfirmed`, because some pages are legitimately short.
const THIN_WORDS = 250;

const SKIP_SCHEME = /^(mailto:|tel:|javascript:|data:|#)/i;

/* ------------------------------------------------------------------ robots */

/** Fetch and parse robots.txt. Its absence is not a finding; a blanket Disallow is. */
async function fetchRobots(origin, timeout) {
  const url = new URL('/robots.txt', origin).href;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
    if (!res.ok) return { url, present: false, disallow: [], sitemaps: [], raw: '' };
    const raw = (await res.text()).slice(0, 20000);
    const disallow = [];
    const sitemaps = [];
    let appliesToUs = false;
    for (const line of raw.split(/\r?\n/)) {
      const [rawKey, ...rest] = line.split(':');
      if (!rest.length) continue;
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') appliesToUs = value === '*';
      else if (key === 'disallow' && appliesToUs && value) disallow.push(value);
      else if (key === 'sitemap') sitemaps.push(value);
    }
    return { url, present: true, disallow, sitemaps, raw };
  } catch {
    return { url, present: false, disallow: [], sitemaps: [], raw: '' };
  }
}

/** Crude but adequate robots matching: prefix rules, `*` wildcards, `$` anchor. */
function robotsBlocks(robots, targetUrl) {
  if (!robots.present) return false;
  const p = new URL(targetUrl).pathname;
  return robots.disallow.some((rule) => {
    if (rule === '/') return true;
    const re = new RegExp('^' + rule.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'));
    return re.test(p);
  });
}

/* -------------------------------------------------------------- collection */

async function collectPage(browser, url, timeout) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (compatible; web-audit-toolkit; passive technical SEO check)',
  });
  const page = await context.newPage();
  let response = null;
  let loadError = null;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(600); // let a client-rendered head settle
  } catch (e) {
    loadError = String(e.message || e).split('\n')[0];
  }

  if (loadError) {
    await context.close();
    return { url, loadError, status: null, headers: {}, facts: null };
  }

  const facts = await page.evaluate(() => {
    const abs = (h) => { try { return new URL(h, location.href).href; } catch { return null; } };
    const metaBy = (sel) => [...document.querySelectorAll(sel)].map((m) => (m.getAttribute('content') || '').trim());

    const main = document.querySelector('main, article, [role="main"]') || document.body;
    const clone = main.cloneNode(true);
    for (const el of clone.querySelectorAll('script,style,nav,footer,header,aside,noscript,template')) el.remove();
    const bodyText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const words = bodyText ? bodyText.split(' ').filter(Boolean).length : 0;

    const imgs = [...document.querySelectorAll('img')];

    return {
      titles: [...document.querySelectorAll('head title')].map((t) => (t.textContent || '').trim()),
      descriptions: metaBy('meta[name="description" i]'),
      robotsMeta: metaBy('meta[name="robots" i], meta[name="googlebot" i]'),
      canonicals: [...document.querySelectorAll('link[rel="canonical" i]')].map((l) => abs(l.getAttribute('href') || '')),
      headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) }))
        .filter((h) => h.text),
      lang: document.documentElement.getAttribute('lang'),
      viewport: metaBy('meta[name="viewport" i]')[0] || null,
      og: {
        title: metaBy('meta[property="og:title" i]')[0] || null,
        description: metaBy('meta[property="og:description" i]')[0] || null,
        image: metaBy('meta[property="og:image" i]')[0] || null,
      },
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
      words,
      bodyText,
      images: {
        total: imgs.length,
        // `alt=""` is correct for decorative images. Only a MISSING attribute
        // is a defect, so check for the attribute, not for a truthy value.
        missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src).filter(Boolean).slice(0, 10),
      },
      links: [...new Set(
        [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /^https?:/i.test(h))
      )],
    };
  });

  const headers = {};
  for (const [k, v] of Object.entries(response?.headers() || {})) headers[k.toLowerCase()] = v;

  // Keep a fingerprint of the body text for cross-page duplicate detection, but
  // not the text itself, which would multiply the size of seo.json for no gain.
  facts.textHash = facts.bodyText ? createHash('sha1').update(facts.bodyText).digest('hex').slice(0, 16) : null;
  facts.textSample = (facts.bodyText || '').slice(0, 120);
  delete facts.bodyText;

  // A canonical can also be declared in the HTTP Link header, which is
  // invisible in the page source. Collect those alongside the DOM ones so a
  // disagreement between the two is visible rather than silently ignored.
  facts.headerCanonicals = parseLinkHeaderCanonicals(headers.link, url);

  await context.close();
  return { url, loadError: null, status: response?.status() ?? null, headers, facts };
}

/**
 * Pull `rel=canonical` targets out of an HTTP Link header.
 * Format is RFC 8288: `<url>; rel="canonical", <url2>; rel="next"`.
 */
function parseLinkHeaderCanonicals(headerValue, base) {
  if (!headerValue) return [];
  const out = [];
  // Split on commas that separate entries, not commas inside <...>.
  for (const part of String(headerValue).split(/,(?=\s*<)/)) {
    const m = part.match(/<([^>]*)>(.*)$/);
    if (!m) continue;
    const rel = m[2].match(/rel\s*=\s*"?([^";]+)"?/i);
    if (!rel || !rel[1].trim().toLowerCase().split(/\s+/).includes('canonical')) continue;
    try {
      out.push(new URL(m[1].trim(), base).href);
    } catch {}
  }
  return out;
}

/* ---------------------------------------------------------- per-page rules */

function analysePage(page, robots) {
  const findings = [];
  const f = page.facts;
  const at = page.url;
  const add = (o) => findings.push(finding({ category: 'seo', url: at, ...o }));

  if (page.loadError) {
    add({
      id: 'seo-page-unreachable', severity: 'high', effort: 'quick',
      title: 'A page could not be loaded for the SEO check',
      evidence: `GET ${at}\n    ${page.loadError}`,
      impact: 'If a search engine sees what this check saw, the page cannot be indexed at all. It may equally be a fault in the test environment, so confirm it in a normal browser before reporting it.',
      fix: 'Open the URL in a browser. If it loads normally, re-run the collector from a different network before including this.',
      unconfirmed: true,
    });
    return { findings };
  }

  /* --- what the server actually answered --- */

  // A page that renders HTML can still be an error to a crawler: the status
  // line is what decides whether it is indexed, not whether it looks fine.
  const status = page.status;
  if (status && status >= 500) {
    add({
      id: 'seo-status-server-error', severity: 'high', effort: 'moderate',
      title: 'A page answers with a server error',
      evidence: `GET ${at}\n    HTTP ${status}`,
      impact: 'Visitors reaching this address see an error rather than the page. Search engines drop a page that answers this way, and if it happens across many addresses they slow down crawling the whole site. The page may still render something, which is why this is easy to miss by eye.',
      fix: 'Find why the server is failing for this address and fix it. If the page has genuinely been removed, answer 404 or 410 deliberately rather than 5xx.',
    });
  } else if (status === 404 || status === 410) {
    add({
      id: 'seo-status-not-found', severity: 'medium', effort: 'quick',
      title: 'A page we were asked to check does not exist',
      evidence: `GET ${at}\n    HTTP ${status}`,
      impact: 'This address returns "not found". If it is linked from anywhere, or was previously indexed, visitors following those links reach nothing and any ranking it held is lost.',
      fix: 'Restore the page, or redirect the address to whatever replaced it with a 301 so existing links and bookmarks keep working.',
    });
  } else if (status === 401 || status === 403) {
    add({
      id: 'seo-status-blocked', severity: 'medium', effort: 'quick',
      title: 'A page refuses access',
      evidence: `GET ${at}\n    HTTP ${status}`,
      impact: 'The server refused to serve this address to an ordinary visitor, so a search engine cannot read it either and it will not be listed. Correct for an admin or account page; a mistake for anything meant to be public.',
      fix: 'If the page is meant to be public, remove whatever is refusing it: an access rule, a password, or a firewall. If it is not, no action is needed and this can be ignored.',
      unconfirmed: true,
    });
  }

  /* --- indexability: the findings worth the whole audit --- */

  const robotsMeta = f.robotsMeta.join(', ').toLowerCase();
  const xRobots = (page.headers['x-robots-tag'] || '').toLowerCase();

  if (/\bnoindex\b/.test(robotsMeta)) {
    add({
      id: 'seo-noindex-meta', severity: 'critical', effort: 'quick',
      title: 'This page tells search engines not to list it',
      evidence: `<meta name="robots" content="${f.robotsMeta.join('" / "')}">\n    on ${at}`,
      impact: 'This single tag removes the page from Google entirely. It will not appear for any search, including the business’s own name. It is most often left behind from a staging site or a site that was deliberately hidden before launch and never switched back.',
      fix: 'Remove `noindex` from the robots meta tag on pages that should be found. Check the whole site, not just this page, because the tag is usually applied in a shared layout or template.',
    });
  }

  if (/\bnoindex\b/.test(xRobots)) {
    add({
      id: 'seo-noindex-header', severity: 'critical', effort: 'quick',
      title: 'The server sends a header telling search engines not to list this page',
      evidence: `X-Robots-Tag: ${page.headers['x-robots-tag']}\n    in the response to GET ${at}`,
      impact: 'Same effect as a noindex tag, and harder to spot because it is invisible in the page source. The page will not appear in search results.',
      fix: 'Remove the `X-Robots-Tag: noindex` header from responses for public pages. It is set at the server, CDN or hosting-platform level rather than in the page itself.',
    });
  }

  if (robots.present && robots.disallow.includes('/')) {
    add({
      id: 'seo-robots-disallow-all', severity: 'critical', effort: 'quick',
      title: 'robots.txt asks every search engine to skip the whole site',
      evidence: `${robots.url}\n    User-agent: *\n    Disallow: /`,
      impact: 'This blocks crawlers from the entire site. Nothing new gets indexed and existing pages drop out over time. Like a stray noindex, it is almost always left over from before launch.',
      fix: 'Remove the `Disallow: /` line, keeping any narrower rules for admin or checkout paths that genuinely should not be crawled.',
    });
  }

  const domCanon = f.canonicals.filter(Boolean);
  const hdrCanon = (f.headerCanonicals || []).filter(Boolean);
  const canon = [...domCanon, ...hdrCanon];
  if (canon.length > 1 && new Set(canon).size > 1) {
    add({
      id: 'seo-canonical-conflict', severity: 'high', effort: 'quick',
      title: 'The page names more than one "official" address for itself',
      evidence: [
        ...domCanon.map((c) => `<link rel="canonical" href="${c}">`),
        ...hdrCanon.map((c) => `Link: <${c}>; rel="canonical"   (HTTP header, not visible in the page source)`),
      ].join('\n    ') + `\n    on ${at}`,
      impact: 'A canonical tag tells search engines which address is the real one when several show the same content. Two conflicting tags is a contradiction, so search engines ignore both and guess, which can split the page’s ranking across duplicate addresses.',
      fix: 'Emit exactly one canonical link per page, in one place. Two usually means a layout and a page template are each adding one, or that one is in the HTML while another is set as an HTTP header at the server or CDN.',
    });
  } else if (canon.length === 1) {
    const here = new URL(at);
    const target = new URL(canon[0]);
    const sameIsh = here.origin === target.origin && here.pathname.replace(/\/$/, '') === target.pathname.replace(/\/$/, '');
    if (!sameIsh) {
      add({
        id: 'seo-canonical-elsewhere', severity: 'medium', effort: 'quick',
        title: 'This page points search engines at a different address',
        evidence: `Requested: ${at}\n    ${hdrCanon.length ? `Link: <${canon[0]}>; rel="canonical"   (HTTP header)` : `<link rel="canonical" href="${canon[0]}">`}`,
        impact: 'Search engines will show the other address instead of this one, and any links earned by this page are credited there. Correct when the pages really are duplicates; a mistake when they are not.',
        fix: 'Confirm the target is genuinely the same content. If it is not, point the canonical at this page’s own address.',
        unconfirmed: true,
      });
    }
  }

  /* --- the head tags a searcher actually sees --- */

  const title = f.titles[0] || '';
  if (!title) {
    add({
      id: 'seo-title-missing', severity: 'high', effort: 'quick',
      title: 'The page has no title',
      evidence: `No <title> element in the head of ${at}`,
      impact: 'The title is the blue clickable line in search results and the label on a browser tab. Without one, Google invents something from the page content, usually badly, and the page loses its single strongest ranking signal.',
      fix: 'Add a `<title>` of roughly 50–60 characters that names the page and the business, most specific part first.',
    });
  } else if (f.titles.length > 1) {
    add({
      id: 'seo-title-multiple', severity: 'medium', effort: 'quick',
      title: 'The page has more than one title',
      evidence: f.titles.map((t) => `<title>${t}</title>`).join('\n    ') + `\n    on ${at}`,
      impact: 'Only the first is used; the rest are ignored. It normally means two templates are each adding one, so the wrong one can win on other pages.',
      fix: 'Set the title in one place, usually the layout, and let pages override it rather than append to it.',
    });
  } else if (title.length > TITLE_MAX) {
    add({
      id: 'seo-title-long', severity: 'low', effort: 'quick',
      title: 'The page title is cut off in search results',
      evidence: `${title.length} characters on ${at}:\n    "${title}"`,
      impact: `Google truncates titles at roughly ${TITLE_MAX} characters, so the end of this one is replaced with an ellipsis. If the distinguishing words are at the end, searchers never see them.`,
      fix: `Shorten to under ${TITLE_MAX} characters, putting the words that distinguish this page first and the business name last.`,
    });
  } else if (title.length < TITLE_MIN) {
    add({
      id: 'seo-title-short', severity: 'low', effort: 'quick',
      title: 'The page title is very short',
      evidence: `${title.length} characters on ${at}:\n    "${title}"`,
      impact: 'A short title gives searchers little reason to click and gives search engines little to match a query against.',
      fix: 'Expand to roughly 50–60 characters describing what the page offers.',
    });
  }

  const desc = f.descriptions[0] || '';
  if (!desc) {
    add({
      id: 'seo-meta-description-missing', severity: 'low', effort: 'quick',
      title: 'The page has no description for search results',
      evidence: `No <meta name="description"> on ${at}`,
      impact: 'The description is the grey text under the blue link. Without one, Google pulls an arbitrary sentence from the page, often a cookie notice or a menu. It does not affect ranking, but it affects how many people click.',
      fix: `Add a \`<meta name="description">\` of ${META_MIN}–${META_MAX} characters describing the page as a sentence a customer would read.`,
    });
  } else if (desc.length > META_MAX) {
    add({
      id: 'seo-meta-description-long', severity: 'low', effort: 'quick',
      title: 'The search-result description is cut off',
      evidence: `${desc.length} characters on ${at}:\n    "${desc.slice(0, 180)}…"`,
      impact: `Anything past roughly ${META_MAX} characters is replaced with an ellipsis, so a call to action at the end is never seen.`,
      fix: `Trim to under ${META_MAX} characters.`,
    });
  } else if (desc.length < META_MIN) {
    add({
      id: 'seo-meta-description-short', severity: 'low', effort: 'quick',
      title: 'The search-result description is very short',
      evidence: `${desc.length} characters on ${at}:\n    "${desc}"`,
      impact: `A description this brief leaves most of the space Google gives it unused, and gives a searcher little reason to choose this result over the one above it. Under roughly ${META_MIN} characters, Google is also more likely to discard it and pull its own sentence from the page instead.`,
      fix: `Expand to ${META_MIN}–${META_MAX} characters, describing what the page offers as a sentence a customer would read.`,
    });
  }

  /* --- structure --- */

  const h1s = f.headings.filter((h) => h.level === 1);
  if (!h1s.length) {
    add({
      id: 'seo-h1-missing', severity: 'medium', effort: 'quick',
      title: 'The page has no main heading',
      evidence: `No <h1> found on ${at}. First heading is ${f.headings[0] ? `an <h${f.headings[0].level}>: "${f.headings[0].text}"` : 'absent, the page has no headings at all'}.`,
      impact: 'The main heading tells both a search engine and a screen-reader user what the page is about. Styling text to look like a heading is not the same thing, because only the markup is read.',
      fix: 'Mark the page’s main heading as `<h1>`. One per page.',
    });
  } else if (h1s.length > 1) {
    add({
      id: 'seo-h1-multiple', severity: 'low', effort: 'quick',
      title: 'The page has several main headings',
      evidence: h1s.map((h) => `<h1>${h.text}</h1>`).join('\n    ') + `\n    on ${at}`,
      impact: 'With several top-level headings the page’s subject is ambiguous, and the outline a screen reader announces becomes flat.',
      fix: 'Keep one `<h1>` and demote the rest to `<h2>`.',
    });
  }

  const skip = f.headings.find((h, i) => i > 0 && h.level - f.headings[i - 1].level > 1);
  if (skip) {
    add({
      id: 'seo-heading-skip', severity: 'low', effort: 'quick',
      title: 'Heading levels skip a step',
      evidence: `On ${at}, an <h${skip.level}> follows an <h${f.headings[f.headings.indexOf(skip) - 1].level}>:\n    "${skip.text}"`,
      impact: 'Headings are the document outline. Skipping a level breaks how screen readers let a user jump through the page, and muddies which sections belong to which.',
      fix: 'Choose heading levels by position in the outline, not by how large you want the text to look. Set size with CSS.',
    });
  }

  if (!f.viewport) {
    add({
      id: 'seo-viewport-missing', severity: 'high', effort: 'quick',
      title: 'The page is not set up for phones',
      evidence: `No <meta name="viewport"> on ${at}`,
      impact: 'Without this tag a phone renders the page at desktop width and zooms out, leaving text too small to read. Google indexes the mobile version of a site first, so this affects both visitors and ranking.',
      fix: 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to the shared layout.',
    });
  }

  if (!f.lang) {
    add({
      id: 'seo-lang-missing', severity: 'low', effort: 'quick',
      title: 'The page does not declare its language',
      evidence: `<html> has no lang attribute on ${at}`,
      impact: 'Screen readers use it to choose a pronunciation, and browsers use it to offer translation. Without it, a screen reader may read English with the wrong accent rules.',
      fix: 'Set `<html lang="en">`, or the correct code for the language, in the layout.',
    });
  }

  if (f.images.total && f.images.missingAlt.length) {
    add({
      id: 'seo-images-missing-alt', severity: 'low', effort: 'moderate',
      title: 'Some images have no text alternative',
      evidence: `${f.images.missingAlt.length} of ${f.images.total} images on ${at} have no alt attribute:\n    ` + f.images.missingAlt.slice(0, 3).map((s) => s.slice(0, 90)).join('\n    '),
      impact: 'A blind visitor hears nothing where the image is, and the image cannot appear in image search. Note that an empty `alt=""` is correct for purely decorative images. These have no attribute at all.',
      fix: 'Add `alt` text describing what the image shows. For decorative images, add `alt=""` explicitly so assistive technology knows to skip them.',
    });
  }

  if (f.words < THIN_WORDS) {
    add({
      id: 'seo-thin-content', severity: 'info', effort: 'involved',
      title: 'A page has very little text',
      evidence: `About ${f.words} words of body text on ${at}`,
      impact: 'Pages with little text rarely rank for anything beyond the business name, because there is nothing for a search engine to match a query against. Legitimate for a contact or login page; a problem for a page meant to attract visitors.',
      fix: 'If this page is meant to bring in search traffic, expand it to answer the questions a customer would actually ask. If it is not, no action needed.',
      unconfirmed: true,
    });
  }

  if (!f.og.title || !f.og.image) {
    const missing = [!f.og.title && 'og:title', !f.og.description && 'og:description', !f.og.image && 'og:image'].filter(Boolean);
    add({
      id: 'seo-open-graph-missing', severity: 'low', effort: 'quick',
      title: 'Links to this site look plain when shared',
      evidence: `Missing ${missing.join(', ')} on ${at}`,
      impact: 'When someone shares the link on WhatsApp, Facebook or LinkedIn, these tags decide whether it appears as a picture with a headline or as a bare URL. A bare URL gets noticeably fewer clicks.',
      fix: 'Add `og:title`, `og:description` and an `og:image` of about 1200×630 to the shared layout, defaulting to the business logo where a page has no image of its own.',
    });
  }

  // A dead end is not only a page with zero links out. A page whose single
  // link is a footer link to the privacy policy is just as much the end of the
  // path, so the threshold is "one or fewer", not "none".
  const sameOriginOut = [...new Set((f.links || [])
    .map((h) => h.split('#')[0])
    .filter((h) => {
      try { return new URL(h).origin === new URL(at).origin && h !== at.split('#')[0]; } catch { return false; }
    }))];
  if (sameOriginOut.length <= 1) {
    add({
      id: 'seo-no-outgoing-links', severity: 'low', effort: 'quick',
      title: 'A page leads nowhere else on the site',
      evidence: sameOriginOut.length
        ? `${at}\n    links to exactly one other page of this site: ${sameOriginOut[0]}`
        : `No links to other pages of this site were found on ${at}`,
      impact: 'A visitor who lands here from search has nowhere relevant to go next, so they leave. For a search engine it is the end of a path, which means any page reachable only from here is reachable from nowhere at all.',
      fix: 'Add links onward that suit the page: the section it belongs to, related items, or the next step in whatever the visitor came to do. Site-wide navigation counts, but only if it is actually rendered on this page.',
    });
  }

  return { findings };
}

/**
 * Positives are worked out across the whole corpus, never per page.
 *
 * Gathering them per page and unioning produces claims the report's own
 * findings disprove. One page with a good title emits "titles are present and
 * sized to display fully" even when another page has none. A positive is only
 * honest if it holds for every page tested, so each of these is the absence of
 * its corresponding failure.
 */
function corpusPositives(pages, robots, findings) {
  const live = pages.filter((p) => p.facts);
  if (!live.length) return [];
  const ids = new Set(findings.map((f) => f.id));
  const none = (...bad) => !bad.some((id) => ids.has(id));
  const every = (fn) => live.every(fn);
  const out = [];

  if (every((p) => p.facts.titles[0]) && none('seo-title-missing', 'seo-title-short', 'seo-title-long', 'seo-title-multiple', 'seo-duplicate-title')) {
    out.push('Every page has its own title, sized to display in full in search results.');
  }
  if (every((p) => p.facts.descriptions[0]) && none('seo-meta-description-missing', 'seo-meta-description-long', 'seo-meta-description-short', 'seo-duplicate-meta')) {
    out.push('Every page has its own search-result description.');
  }
  if (none('seo-h1-missing', 'seo-h1-multiple', 'seo-heading-skip')) {
    out.push('Every page has exactly one main heading, and the heading levels run in order.');
  }
  if (every((p) => p.facts.viewport)) out.push('Every page is set up to display properly on phones.');
  if (every((p) => p.facts.lang)) out.push('Every page declares the language it is written in.');
  if (every((p) => p.facts.jsonLd)) out.push('The site publishes structured data, which helps search engines understand what it offers.');

  const imgs = live.reduce((a, p) => a + p.facts.images.total, 0);
  if (imgs && none('seo-images-missing-alt')) {
    out.push(`All ${imgs} images we saw carry a text alternative.`);
  }
  if (none('seo-noindex-meta', 'seo-noindex-header', 'seo-robots-disallow-all')) {
    out.push('Nothing on the site tells search engines to stay away, so every page tested is free to be listed.');
  }
  if (robots.present) out.push('A robots.txt is published.');
  if (robots.sitemaps.length) out.push('A sitemap is declared in robots.txt, which helps search engines find every page.');

  return out;
}

/* ----------------------------------------------------- cross-page findings */

function analyseCorpus(pages) {
  const findings = [];
  const live = pages.filter((p) => p.facts);
  if (live.length < 2) return findings;

  const group = (pick) => {
    const m = new Map();
    for (const p of live) {
      const v = (pick(p) || '').trim();
      if (!v) continue;
      if (!m.has(v)) m.set(v, []);
      m.get(v).push(p.url);
    }
    return [...m.entries()].filter(([, urls]) => urls.length > 1);
  };

  for (const [value, urls] of group((p) => p.facts.titles[0])) {
    findings.push(finding({
      id: 'seo-duplicate-title', category: 'seo', severity: 'medium', effort: 'moderate',
      title: 'Several pages share the same title',
      evidence: `"${value}" is the title of ${urls.length} pages:\n    ` + urls.slice(0, 5).join('\n    '),
      impact: 'Search engines use the title to tell pages apart. When several are identical they compete with each other for the same searches, and the one that wins is not necessarily the one you would choose.',
      fix: 'Give each page a title naming what is specific to it, such as the product, the category or the location, before the business name.',
    }));
    break; // one worked example is enough; the pattern is the finding
  }

  for (const [value, urls] of group((p) => p.facts.descriptions[0])) {
    findings.push(finding({
      id: 'seo-duplicate-meta', category: 'seo', severity: 'low', effort: 'moderate',
      title: 'Several pages share the same search-result description',
      evidence: `"${value.slice(0, 110)}…" appears on ${urls.length} pages:\n    ` + urls.slice(0, 5).join('\n    '),
      impact: 'Identical descriptions make every result look the same in a list, so searchers cannot tell which page answers their question.',
      fix: 'Write a description per page, or generate one from the page’s own content.',
    }));
    break;
  }

  // Duplicate body text. Matched on a hash of the visible text, so this is an
  // exact match rather than a similarity score. It does not guess.
  for (const [, urls] of group((p) => (p.facts.words >= 25 ? p.facts.textHash : ''))) {
    const sample = live.find((p) => urls.includes(p.url))?.facts.textSample || '';
    findings.push(finding({
      id: 'seo-duplicate-content', category: 'seo', severity: 'medium', effort: 'involved',
      title: 'Several pages show word-for-word the same content',
      evidence: `${urls.length} pages have identical body text:\n    ` + urls.slice(0, 5).join('\n    ') + `\n    beginning "${sample.slice(0, 80)}…"`,
      impact: 'When the same text is published at more than one address, search engines pick one to show and largely ignore the rest, and the choice is theirs rather than yours. Any links pointing at the copies count for less than they would if everything pointed at one page.',
      fix: 'Keep one address as the real one and either remove the duplicates or add a canonical link on each copy pointing at it. Where the pages are meant to differ, the shared text is the thing to change.',
    }));
    break;
  }

  return findings;
}

/* ------------------------------------------------------------------ orphans */

/** Fetch a sitemap and return the URLs it lists. Nested sitemap indexes are followed one level. */
async function fetchSitemapUrls(sitemapUrls, origin, timeout) {
  const candidates = sitemapUrls.length ? sitemapUrls : [new URL('/sitemap.xml', origin).href];
  const found = new Set();
  const seenMaps = new Set();
  const queue = [...candidates];
  while (queue.length && seenMaps.size < 5) {
    const url = queue.shift();
    if (seenMaps.has(url)) continue;
    seenMaps.add(url);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 2_000_000);
      const isIndex = /<sitemapindex/i.test(xml);
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        if (isIndex) queue.push(m[1]);
        else found.add(m[1]);
      }
    } catch {}
  }
  return [...found];
}

/**
 * A page listed in the sitemap that nothing we saw links to. Reported
 * `unconfirmed` and only when enough of the sitemap was audited to make the
 * comparison meaningful. Following links from four pages of a 400-page site
 * would call almost everything an orphan.
 */
function analyseOrphans(pages, sitemapUrls, linkTargets) {
  if (!sitemapUrls.length) return [];
  const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return u; } };
  const reachable = new Set([...pages.map((p) => p.url), ...linkTargets].map(norm));
  const orphans = sitemapUrls.filter((u) => !reachable.has(norm(u)));
  // Below this the audit simply did not look at enough of the site to tell.
  const coverage = (sitemapUrls.length - orphans.length) / sitemapUrls.length;
  if (!orphans.length || coverage < 0.5) return [];
  return [finding({
    id: 'seo-orphan-pages', category: 'seo', severity: 'low', effort: 'quick', url: orphans[0],
    title: 'Some pages are listed in the sitemap but nothing links to them',
    evidence: `${orphans.length} of ${sitemapUrls.length} sitemap entries were not linked from any page we looked at:\n    ` + orphans.slice(0, 5).join('\n    '),
    impact: 'A page nothing links to is reachable only by knowing its address. Search engines will usually still index it because the sitemap names it, but it receives none of the standing the rest of the site has earned, so it ranks far below where it could.',
    fix: 'Link each of these from somewhere it belongs: a navigation menu, a category listing, or a related-items block. If a page is deliberately unlisted, remove it from the sitemap so the two agree.',
    unconfirmed: true,
  })];
}

/* -------------------------------------------------------------- link check */

/** Walk a redirect chain by hand so chains and loops are visible, not flattened. */
async function trace(url, timeout, maxHops = 5) {
  const chain = [];
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      return { chain, status: null, error: String(e.message || e).split('\n')[0], final: current };
    }
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { chain, status: res.status, error: 'redirect without a Location header', final: current };
      const next = new URL(loc, current).href;
      if (chain.some((c) => c.url === next)) return { chain, status: res.status, loop: true, final: next };
      current = next;
      continue;
    }
    return { chain, status: res.status, final: current };
  }
  return { chain, status: chain.at(-1)?.status ?? null, tooLong: true, final: current };
}

async function checkLinks(pages, robots, { max, timeout }) {
  const findings = [];
  const origins = new Set(pages.map((p) => new URL(p.url).origin));
  const seen = new Set(pages.map((p) => p.url));
  const queue = [];

  for (const p of pages) {
    for (const href of p.facts?.links || []) {
      if (SKIP_SCHEME.test(href)) continue;
      const clean = href.split('#')[0];
      if (!origins.has(new URL(clean).origin)) continue; // same-origin only
      if (seen.has(clean)) continue;
      if (robotsBlocks(robots, clean)) continue;         // honour their robots.txt
      seen.add(clean);
      queue.push({ href: clean, from: p.url });
      if (queue.length >= max) break;
    }
    if (queue.length >= max) break;
  }

  const broken = [];
  const chains = [];
  const loops = [];
  for (const { href, from } of queue) {
    const t = await trace(href, timeout);
    if (t.loop) loops.push({ href, from, chain: t.chain });
    else if (t.error || (t.status && t.status >= 400)) broken.push({ href, from, status: t.status, error: t.error });
    else if (t.chain.length > 2) chains.push({ href, from, chain: t.chain });
  }

  if (broken.length) {
    findings.push(finding({
      id: 'seo-broken-internal-links', category: 'seo', severity: 'medium', effort: 'quick',
      title: 'The site links to pages that do not exist',
      evidence: broken.slice(0, 5).map((b) => `${b.status || b.error}  ${b.href}\n      linked from ${b.from}`).join('\n    '),
      impact: 'A visitor who follows one of these reaches an error page and often leaves. Search engines treat a site that links to its own missing pages as less well maintained, and any ranking those pages had is lost.',
      fix: 'Point each link at the current address, or restore the page. Where a page moved permanently, add a 301 redirect from the old address so existing links and bookmarks keep working.',
    }));
  }

  if (loops.length) {
    findings.push(finding({
      id: 'seo-redirect-loop', category: 'seo', severity: 'high', effort: 'quick',
      title: 'Some addresses redirect in a circle',
      evidence: loops.slice(0, 3).map((l) => `${l.href}\n      ` + l.chain.map((c) => `${c.status} → ${c.url}`).join('\n      ')).join('\n    '),
      impact: 'The browser gives up and shows an error, so the page is unreachable for visitors and cannot be indexed at all. Usually caused by two rules disagreeing about a trailing slash or about www.',
      fix: 'Pick one canonical form, with or without the trailing slash and with or without www, then make every rule redirect towards it rather than between the two.',
    }));
  }

  if (chains.length) {
    findings.push(finding({
      id: 'seo-redirect-chain', category: 'seo', severity: 'low', effort: 'quick',
      title: 'Some links pass through several redirects',
      evidence: chains.slice(0, 3).map((c) => `${c.href}\n      ` + c.chain.map((h) => `${h.status} → ${h.url}`).join('\n      ')).join('\n    '),
      impact: 'Each hop adds a round trip before anything appears, which is most noticeable on a phone. Search engines also pass slightly less ranking credit through each additional hop.',
      fix: 'Update the links to point at the final address, and collapse the server rules so one redirect reaches the destination.',
    }));
  }

  return { findings, checked: queue.length };
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = args._.map(assertPassiveTarget).map(String);
  if (!urls.length) {
    console.error('usage: check-seo.mjs <url...> --out DIR [--max-links 30] [--no-links] [--no-sitemap]');
    process.exit(1);
  }
  const outDir = args.out || path.join(process.cwd(), 'audit-out');
  const timeout = Number(args.timeout || 30000);
  const maxLinks = Number(args['max-links'] || 30);

  const robots = await fetchRobots(new URL(urls[0]).origin, timeout);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });

  const pages = [];
  const findings = [];
  try {
    for (const url of urls) {
      process.stderr.write(`  ${url} … `);
      const page = await collectPage(browser, url, timeout);
      findings.push(...analysePage(page, robots).findings);
      pages.push(page);
      process.stderr.write(page.loadError ? 'failed\n' : 'done\n');
    }
  } finally {
    await browser.close();
  }

  findings.push(...analyseCorpus(pages));

  let linksChecked = 0;
  let linksClean = false;
  if (!args['no-links']) {
    process.stderr.write(`  following up to ${maxLinks} internal links … `);
    const l = await checkLinks(pages, robots, { max: maxLinks, timeout });
    findings.push(...l.findings);
    linksChecked = l.checked;
    linksClean = Boolean(linksChecked && !l.findings.length);
    process.stderr.write(`${linksChecked} checked\n`);
  }

  // Orphan pages need the sitemap: a page nothing links to cannot, by
  // definition, be found by following links.
  const sitemapUrls = args['no-sitemap'] ? [] : await fetchSitemapUrls(robots.sitemaps, new URL(urls[0]).origin, timeout);
  findings.push(...analyseOrphans(pages, sitemapUrls, pages.flatMap((p) => p.facts?.links || [])));

  const positives = new Set(corpusPositives(pages, robots, findings));
  if (linksClean) positives.add(`All ${linksChecked} internal links we followed resolved without an error or a redirect chain.`);

  // The same defect usually appears on every page; report each once, keeping
  // the first page it was seen on as the example.
  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).sort(bySeverityThenEffort);

  const file = writeJson(outDir, 'seo', {
    tool: 'check-seo', mode: 'passive', collectedAt: new Date().toISOString(),
    command: `node check-seo.mjs ${urls.join(' ')}`,
    urls,
    robots: { url: robots.url, present: robots.present, disallow: robots.disallow, sitemaps: robots.sitemaps },
    linksChecked,
    sitemapUrlCount: sitemapUrls.length,
    pages: pages.map((p) => ({ url: p.url, status: p.status, loadError: p.loadError, facts: p.facts })),
    findings: unique,
    positives: [...positives],
  });

  summarise('Technical SEO (passive)', unique);
  console.log(`\nWrote ${file}`);
  console.log('Reminder: severity here is provisional. Re-rank by consequence to this business. See SKILL.md §2.');
}

main().catch((e) => { console.error(e); process.exit(1); });
