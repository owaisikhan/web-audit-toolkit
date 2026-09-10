# Measuring speed so the number survives an argument

The site owner will forward your numbers to whoever built the site. That
person will re-run it on their laptop, on fibre, with a warm cache, get a
different answer, and say your report is wrong. Everything here exists to
make sure you win that exchange.

## Measure the condition your visitors are actually in

The default in `scripts/collect-perf.mjs` is a throttled mobile profile,
because that is what most visitors are on and it is where sites fail. But
report both:

| Profile | What it represents |
|---|---|
| `mobile` (default) | 4× CPU slowdown, ~1.6 Mbps down / 750 kbps up, 150 ms RTT, 412×915 viewport. A mid-range Android on a normal connection. |
| `desktop` | No CPU throttle, no network throttle, 1440×900. The condition the developer tested in. |

Always state the profile next to the number. `LCP 5.9 s (mobile profile)` is
defensible; `LCP 5.9 s` is an invitation to be contradicted.

**Cold cache, every run.** The collector uses a fresh browser context per run
so nothing is served from disk cache. A repeat-visit number is a different,
also-useful measurement — but it is not the number that describes someone
arriving from a search result.

**Median of at least three runs.** First-byte time in particular swings by
hundreds of milliseconds depending on whether a serverless function was cold.
One run is an anecdote.

## What the metrics mean, and the threshold that matters

| Metric | Good | Needs work | Poor | What it is |
|---|---|---|---|---|
| **LCP** Largest Contentful Paint | ≤ 2.5 s | ≤ 4.0 s | > 4.0 s | When the main thing on screen finished drawing. The closest single number to "it felt slow". |
| **CLS** Cumulative Layout Shift | ≤ 0.1 | ≤ 0.25 | > 0.25 | How much content jumped after it appeared. What makes people tap the wrong button. |
| **TBT** Total Blocking Time | ≤ 200 ms | ≤ 600 ms | > 600 ms | How long the page was frozen to input while scripts ran. A lab stand-in for INP. |
| **TTFB** Time to First Byte | ≤ 800 ms | ≤ 1.8 s | > 1.8 s | Server and network before anything can start. |
| **FCP** First Contentful Paint | ≤ 1.8 s | ≤ 3.0 s | > 3.0 s | When the page stopped being blank. |

These are the Core Web Vitals thresholds Google uses, which matters twice
over: it is what the owner will have been told by whoever handles their SEO,
and a poor LCP genuinely does affect ranking. Say so — it converts a technical
number into a business consequence without exaggerating.

**INP cannot be measured in a lab.** It needs a real user interacting. If a
report needs it, take it from the owner's own Chrome UX / Search Console data,
or measure TBT and say plainly that it is a proxy.

## Where the time actually goes

A metric tells you it is slow. These tell you why. The collector records all
of them into `perf.json` under `diagnostics`.

**Render-blocking resources.** Any stylesheet, or any `<script>` in `<head>`
without `defer`/`async`, stops the page drawing until it has downloaded and
run. Count them and sum their transfer size. This is the single most common
fixable cause of a bad FCP and the fix is usually a one-line attribute.

**JavaScript weight.** Report total transferred JS, and the largest three
files by size. The threshold to worry at is roughly **300 kB compressed** of
JS on a content site; a rich app can justify more, a brochure site cannot
justify any of it. Look for:
- A whole UI library imported for a handful of components. In a Next.js app,
  `@mui/material` or `lodash` imported as a namespace rather than per-module
  is worth tens of kilobytes each.
- A date library with all locales bundled.
- Analytics, chat widgets and tag managers loaded synchronously — often more
  than the site's own code, and almost always third-party. Third-party weight
  is a separate line in the report because it is politically easier to remove.

**Images.** The collector flags every image where the file is materially
larger than the box it is drawn into, and every image served as PNG or JPEG
where WebP/AVIF would help. The two findings that recur everywhere:
- **An oversized hero image** — a 2400px-wide JPEG rendered at 700px, often
  the LCP element. Fixing this one asset frequently moves LCP by seconds.
- **No dimensions on images**, which is usually the whole of a bad CLS.
  `width`/`height` attributes, or `aspect-ratio`, and the shift disappears.

In a Next.js codebase, both are usually "you used `<img>` here instead of
`next/image`", which is a satisfyingly small diff to demo.

**Fonts.** A web font with no `font-display: swap` blocks text from painting
for up to three seconds. Self-hosted beats Google Fonts on a third-party
connection. Count the font files and their total size; four weights of two
families is 400 kB that nobody chose deliberately.

**Caching.** For every static asset, read `Cache-Control`. Hashed build assets
(`/_next/static/…`, anything with a content hash in the filename) should be
`public, max-age=31536000, immutable`; if they are not, every repeat visitor
re-downloads the whole site. Missing or short caching on static assets is a
"quick" fix with a large effect on returning visitors, and it does not show up
in a cold-load metric at all — so say which number it improves.

**Compression.** Any text response (HTML, CSS, JS, JSON, SVG) served without
`content-encoding: gzip|br|zstd` is typically 3–4× larger than it needs to be.
The collector flags these. It is nearly always a one-setting fix at the CDN or
server, and it is the highest ratio of "impact" to "effort" in this whole file.

**Redirect chains.** Each hop before the real document costs a full round trip
— on a 150 ms RTT mobile connection, `http://` → `https://` → `www.` → page is
most of a second before the server has begun. The collector records the chain.

**Server work.** A TTFB above a second on a page that is mostly static means
either no caching, a cold serverless function, or work happening per-request
that should not be. With the repo in hand, look for a database query per item
in a list (the N+1), a page that opted out of static rendering by accident, or
missing indexes. Without the repo, you can still report the number and its
consequence.

## Turning a measurement into a sentence the owner cares about

Do this conversion in the report every time:

| Instead of | Write |
|---|---|
| "LCP is 5.9 s" | "On a normal phone, the page takes about six seconds before the main content appears. Google treats anything over 2.5 seconds as poor, and it affects both search ranking and how many visitors leave before the page loads." |
| "1.4 MB of JavaScript" | "Every visit downloads 1.4 MB of code before the page can be used — roughly the size of a three-minute song, on every page view, mostly for features this page does not use." |
| "No cache headers on static assets" | "Returning visitors re-download the entire site each time instead of reusing what their browser already has. This is a server setting, not a code change." |

Do not invent revenue figures. "Studies show a 1-second delay costs 7% of
conversions" is a citation to something the owner cannot check, and applying
it to their traffic is a number you made up. Say what is slow, say what it
affects, and let them value their own funnel.

## Confirm the fix the same way you found the fault

When you fix rather than pitch, re-run the identical command against the same
URLs, same profile, same run count, and put the two numbers side by side. A
before/after table with the exact reproduction command underneath it is the
most persuasive thing in this entire skill, and it takes one command to
produce.
