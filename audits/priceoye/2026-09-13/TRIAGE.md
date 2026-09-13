# Triage: PriceOye (priceoye.pk), 13 September 2026

Passive only. No permission was sought or held: `pick-pages`, `collect-perf`,
`check-headers` and `check-seo` make the requests an ordinary visitor's browser
makes. No source scan (no repo), no authenticated pages, no active probing.
PriceOye is a third party's live site, so the scope is the most restrictive box
in `CLAUDE.md`: public site, no permission.

**This repo is public today.** This run describes unfixed weaknesses on a live
third-party site. Do not leave it here once the repo is private is settled; the
owner has said they will make it private. Nothing in this directory contains a
credential (grep run before commit).

## Pages measured

`pick-pages` ranked a curated money-path set drawn from the sitemap (5 child
sitemaps, ~17,000 URLs, so the whole site was never a candidate for a browser).
Performance and SEO ran on: home, `/mobiles` (listing), a product page
(`/mobiles/samsung/samsung-galaxy-a16`), `/wireless-earbuds` (listing), the
slow `/mobiles/pricelist/budget-4g-phones`, and a comparison page. SEO also
covered `/sale`.

## The environment fought this audit, and that shaped the triage

Chromium could not reach the site through the sandbox at all by the normal
routes. PriceOye's Cloudflare requires TLS 1.3 and rejects TLS 1.2
(`curl --tls-max 1.2` gets `tlsv1 alert protocol version`; 1.3 gets 200). The
documented TLS 1.2 shim in `README.md` therefore produced
`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` on every page, and plain TLS 1.3 through
the proxy produces `ERR_CONNECTION_RESET` (the documented issue #1). Both shims
failed on this host.

**The pages were loaded through a local MITM relay** (built for this run, in
the scratchpad, not committed): Chromium talks TLS to a proxy on `127.0.0.1`,
which bypasses the agent proxy entirely, and the relay re-fetches upstream with
Node's own fetch, which negotiates TLS 1.3 correctly. It served 3,684 requests
across the perf run with zero failures, so the browser data is real. But the
relay decompresses every response and re-serves it without a
`content-encoding` header, and it serialises hundreds of requests per page
load through one Node process. That makes two classes of collector output
unreliable, dropped below.

## Dropped from the report, and why

| Dropped (`--drop`) | Grounds |
|---|---|
| `perf-no-compression` (all pages) | **False.** The relay strips `content-encoding`, so the browser sees every file as uncompressed. Verified independently: `curl -H 'Accept-Encoding: br'` returns `content-encoding: br` on the HTML and on the JS bundles. The site uses Brotli throughout. |
| `perf-js-weight` (all pages) | The relay decompresses responses, so the collector's transfer sizes are uncompressed parse sizes, not over-the-wire bytes, and the figure also counts dynamically-injected third-party scripts. The real first-party JS on the product page is ~344 kB over the wire across 3 files (measured with curl + brotli). The "2 MB downloaded" claim is not defensible through this relay. |
| `perf-tbt-mobile`, `perf-tbt-desktop` (all pages) | `CLAUDE.md` warns TBT tracks the container's shared CPU, and the check it prescribes (compare `resourceSummary.byKind.script` against a previous run) cannot run: `resourceSummary` came back empty and there is no previous PriceOye run. The relay also adds main-thread-independent latency. Not reportable here. |
| `perf-unreachable-mobile` (home) | The homepage mobile load hit the 60 s timeout, but the desktop profile loaded it in LCP 0.7 s, and the page carries ~1,000 images. The timeout is the relay serialising a thousand requests under 4× CPU throttle, not proof the page fails for real phones. Inconclusive, so not reported. The underlying issue (a very heavy homepage) is evidenced elsewhere and kept. |
| `perf-ttfb-desktop` (all pages) | The desktop TTFB readings are relay outliers (10.1 s on the pricelist page, against a curl-measured 3.4–4.4 s). The mobile TTFB on the same page (3.43 s) matches curl, so the server-response story is kept via `perf-ttfb-mobile`; the inflated desktop numbers are dropped. |
| `perf-lcp-desktop` (only the pricelist page triggered it) | Its 10.5 s desktop LCP is dominated by the same relay TTFB outlier above. The mobile LCP (12.78 s) carries the finding; the desktop figure would mislead. |
| Any certificate / expiry line | The TLS certificate recorded in `security.json` names issuer `Anthropic`: the sandbox proxy's cert, not PriceOye's (documented issue #2). Dropped by hand from the report if the generator prints it. Left intact in `security.json`, which is raw evidence. |

Nothing was dropped from the SEO or security findings: each was reproduced and
is true of the page it names.

## Numbers that were re-verified against curl (no relay)

- Pricelist server response 3.4–4.4 s, reproducible over 3 samples. `pick-pages`
  saw one 14 s reading earlier; that was a single cold-start spike and is **not**
  the reported number. Reported: 3–4 s.
- Homepage HTML document is 1.34 MB before any image, script or stylesheet.
- Site compresses with Brotli (see the dropped rows).
- Plain HTTP `301`-redirects to HTTPS; HSTS, `X-Content-Type-Options` and
  `X-Frame-Options` are all present.

## Kept, and how it was ranked

**Performance**

- **Pricelist page is the slowest thing on the site.** Server takes 3–4 s to
  respond (curl-confirmed), main content takes ~12.8 s to appear on a throttled
  phone. It is also editorially stale: the screenshot shows phones marked
  DISCONTINUED and "updated July 18, 2023". The slowest page is the least
  valuable. High.
- **Homepage content shifts as it loads (CLS 0.314 on desktop).** Poor by
  Google's own threshold, and unaffected by the relay. Caused by images with no
  reserved space (65 on the homepage). High / medium.
- **Oversized images** across every page (serving far higher resolution than the
  space shown). Dimensional, so relay-independent. Medium.
- **A pricelist image 404s** (`/images/blist/mobiles-0.webp`), confirmed with
  curl. Low.
- Render-blocking files, older image formats, and web fonts hiding text while
  they load. All low, all relay-independent.
- Mobile LCP on the listings and product page (2.5–3.3 s) is kept but is an
  **upper bound**: the relay adds latency, so the real figure is a little
  faster. Said so in the report's limits.

**SEO**

- **`/sale` carries the homepage's exact title and description** ("Lowest Mobile
  Price In Pakistan - Priceoye"). A 6,200-word page is invisible to search as
  anything distinct. Medium.
- **Product page and comparison page have no `<h1>`.** The two highest-intent
  page types have no main heading. Medium.
- Homepage has 9 `<h1>`s; compare-page title is 104 chars (truncated in search);
  `/mobiles` description is 280 chars (truncated); 10 of 1,007 homepage images
  lack alt text; heading levels skip a step. All low.

**Security**

- **No Content-Security-Policy** on a site with logins and session cookies.
  Medium.
- **No Referrer-Policy.** Low.

## Positives worth stating (the site does a lot right)

HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, HTTP→HTTPS
redirect, session cookies (`po_session`, `po_cart`) all Secure + HttpOnly +
SameSite=Lax, Brotli compression, correct self-referential canonicals on every
page, every page indexable, Open Graph present, no exposed source maps, no
secrets in the served JavaScript.

## Not reported

- `/sale` returned a single HTTP 500 during `pick-pages`, then 200 on the SEO
  pass and 200 on 8 straight retries. A one-off, not reproducible, so not a
  finding. Noted here only.
- `/sitemap.xml` 404s, but `robots.txt` correctly points to the real sitemap at
  `/sitemap/sitemap-index.xml`, so nothing is broken. Not a finding.
- robots.txt disallows several AI crawlers (GPTBot, ClaudeBot, CCBot,
  Google-Extended, Bytespider). That is a deliberate content-rights choice, not
  a defect.
