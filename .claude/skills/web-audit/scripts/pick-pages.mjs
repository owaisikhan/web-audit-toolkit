#!/usr/bin/env node
// Which pages are worth putting a browser on.
//
//   node pick-pages.mjs <sitemap-url | url...> [--top 5] [--concurrency 6]
//                       [--timeout 15000] [--out DIR]
//
// A throttled browser load costs 10 to 20 seconds, so a full performance run
// over a large site is hours: 33 pages on two profiles at three runs each is
// 198 loads. An HTTP request costs milliseconds. This probes every page the
// site publishes, ranks them by what the server does before a browser is
// involved, and tells you which handful deserve the expensive treatment.
//
// It replaces guessing. On a fixture site the slowest page was found by
// reading its name, which does not generalise to a real shop where nothing is
// labelled.
//
// PASSIVE. It reads a sitemap the site advertises, or a list you supply, and
// makes one ordinary GET per URL. It guesses no paths and sends no payloads.
//
// The ranking is evidence, not a decision. Read the table and pick. A slow
// page nobody visits matters less than a fast one every customer lands on, and
// no probe knows which is which.

import {
  parseArgs, writeJson, assertPassiveTarget, kb, ms,
} from './_lib.mjs';

/** Pull page URLs out of a sitemap, following a sitemap index one level down. */
async function fromSitemap(url, timeout) {
  const found = new Set();
  const seen = new Set();
  const queue = [url];
  while (queue.length && seen.size < 5) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    try {
      const res = await fetch(next, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
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
 * One GET per URL, measuring what the server did rather than what the page
 * then does with it. Time to first byte is the part a browser cannot improve
 * on, so a page slow here is slow for everyone however well it is built.
 */
async function probe(url, timeout) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; web-audit-toolkit; passive page probe)' },
    });
    const ttfb = Date.now() - started;
    const body = await res.arrayBuffer();
    return {
      url,
      status: res.status,
      redirected: res.redirected,
      finalUrl: res.url !== url ? res.url : null,
      ttfb,
      total: Date.now() - started,
      bytes: body.byteLength,
      type: (res.headers.get('content-type') || '').split(';')[0],
      encoded: res.headers.get('content-encoding') || null,
      error: null,
    };
  } catch (e) {
    return { url, status: null, ttfb: null, total: Date.now() - started, bytes: 0,
             error: String(e.message || e).split('\n')[0] };
  }
}

/** Run the probes a few at a time, so a big sitemap does not become a flood. */
async function probeAll(urls, { concurrency, timeout }) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) {
      const mine = urls[i++];
      out.push(await probe(mine, timeout));
      if (process.stderr.isTTY) process.stderr.write(`\r  probed ${out.length}/${urls.length}`);
    }
  });
  await Promise.all(workers);
  process.stderr.write(process.stderr.isTTY ? '\n' : `  probed ${out.length} page(s)\n`);
  return out;
}

function main_(results, top) {
  const ok = results.filter((r) => r.status && r.status < 400 && !r.error);
  const bad = results.filter((r) => !r.status || r.status >= 400 || r.error);

  const ttfbs = ok.map((r) => r.ttfb).sort((a, b) => a - b);
  const median = ttfbs.length ? ttfbs[ttfbs.length >> 1] : 0;

  // Worth a browser if the server is slow relative to the rest of this site,
  // or the page is heavy. Both are things a browser run would then explain.
  const scored = ok.map((r) => ({
    ...r,
    slow: median > 0 && r.ttfb > Math.max(median * 2, median + 300),
    heavy: r.bytes > 150 * 1024,
  })).sort((a, b) => b.ttfb - a.ttfb || b.bytes - a.bytes);

  console.log(`\n${results.length} page(s) probed. Median server response ${ms(median)}.\n`);
  console.log('  ' + 'TTFB'.padStart(8) + '  ' + 'SIZE'.padStart(9) + '  STATUS  URL');
  for (const r of scored.slice(0, 25)) {
    const flag = r.slow ? ' SLOW' : r.heavy ? ' HEAVY' : '';
    console.log('  ' + ms(r.ttfb).padStart(8) + '  ' + kb(r.bytes).padStart(9) +
      '  ' + String(r.status).padStart(6) + '  ' + r.url.replace(/^https?:\/\/[^/]+/, '') + flag);
  }
  if (scored.length > 25) console.log(`  ... ${scored.length - 25} more, all faster`);

  if (bad.length) {
    console.log(`\n${bad.length} page(s) did not return a usable response:`);
    for (const r of bad.slice(0, 10)) {
      console.log('  ' + String(r.status || 'ERR').padStart(6) + '  ' +
        r.url.replace(/^https?:\/\/[^/]+/, '') + (r.error ? `  ${r.error}` : ''));
    }
    console.log('  Those are findings in their own right; check-seo reports them.');
  }

  // Take the flagged outliers, not the raw ordering. TTFB on a CDN moves
  // run to run, so below the clear outliers the order is noise: the same
  // static page read 301 ms in one pass and 111 ms in the next. The flags
  // use a margin over the median and survive that; positions do not.
  const home = ok.find((r) => new URL(r.url).pathname === '/');
  const picks = [];
  if (home) picks.push(home.url);
  for (const r of scored) if (r.slow && !picks.includes(r.url) && picks.length < top) picks.push(r.url);
  for (const r of scored) if (r.heavy && !picks.includes(r.url) && picks.length < top) picks.push(r.url);
  // Anything beyond this point is filler, so say how much of the list is
  // evidence and how much is padding rather than implying it is all signal.
  const flagged = picks.length - (home ? 1 : 0);
  for (const r of scored) if (!picks.includes(r.url) && picks.length < top) picks.push(r.url);
  const padding = picks.length - (home ? 1 : 0) - flagged;

  console.log(flagged === 0
    ? '\nNothing stood out. No page was much slower or heavier than the rest, so\nthis list is the home page and an arbitrary few. Choose by what the pages\nare worth to the business instead:\n'
    : `\nA starting set: the home page, ${flagged} that stood out` +
      (padding ? `, and ${padding} to fill the list that did not.\n` : '.\n'));
  console.log('  node $SKILL/scripts/collect-perf.mjs \\');
  console.log(picks.map((u) => `    ${u}`).join(' \\\n') + ' \\');
  console.log('    --out $OUT --runs 3 --all-profiles');
  console.log('\nRead the table before using it. A slow page nobody visits matters less');
  console.log('than a fast one every customer lands on, and this probe cannot tell which');
  console.log('is which. Swap in the listing, the product page and the checkout.');
  return picks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = args._.map(assertPassiveTarget).map(String);
  if (!inputs.length) {
    console.error('usage: pick-pages.mjs <sitemap-url | url...> [--top 5] [--out DIR]');
    process.exit(1);
  }
  const timeout = Number(args.timeout || 15000);
  const concurrency = Number(args.concurrency || 6);
  const top = Number(args.top || 5);

  let urls = inputs;
  if (inputs.length === 1 && /sitemap.*\.xml|\.xml$/i.test(inputs[0])) {
    process.stderr.write(`  reading ${inputs[0]} … `);
    urls = await fromSitemap(inputs[0], timeout);
    process.stderr.write(`${urls.length} URL(s)\n`);
  } else if (inputs.length === 1) {
    // A bare origin: try the sitemap it advertises before falling back to the
    // single page, since one page is rarely what anybody wants ranked.
    const origin = new URL(inputs[0]).origin;
    const guess = await fromSitemap(new URL('/sitemap.xml', origin).href, timeout);
    if (guess.length > 1) {
      process.stderr.write(`  found /sitemap.xml with ${guess.length} URL(s)\n`);
      urls = guess;
    }
  }
  if (!urls.length) { console.error('No URLs to probe.'); process.exit(1); }

  const results = await probeAll(urls, { concurrency, timeout });
  const picks = main_(results, top);

  if (args.out) {
    const file = writeJson(args.out, 'pages', {
      tool: 'pick-pages', mode: 'passive', collectedAt: new Date().toISOString(),
      command: `node pick-pages.mjs ${inputs.join(' ')} --top ${top}`,
      probed: results.length, suggested: picks, results,
    });
    console.log(`\nWrote ${file}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
