# Triage notes, engine.com.pk, 13 September 2026

Internal. Never goes to the client.

Scope: public site, no permission, passive only. No source repository, no
authenticated pages, no active testing. `scan-source.mjs` was not run.

## Sandbox faults corrected during the run

Two collectors were run twice. The first pass of `check-headers.mjs` and
`check-seo.mjs` was made without `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-shim`, so
every page load died on the TLS 1.3 handshake described in README. The damage
was not obvious, and this is worth remembering:

- `check-seo.mjs` failed loudly: five pages "failed", one `seo-page-unreachable`
  finding. Easy to spot.
- `check-headers.mjs` reported "done" for all five pages and wrote a plausible
  `security.json` with `status: null` and no response headers. From that empty
  header set it concluded **HSTS is not set (medium)** and **5 standard security
  headers are not set (low)**. Both were false. `curl -sSI https://engine.com.pk/`
  shows the site sends HSTS, Content-Security-Policy, X-Frame-Options: DENY and
  X-Content-Type-Options: nosniff. Only Referrer-Policy is genuinely absent.

A collector that says "done" is not the same as a collector that got an answer.
Check `pages[].status` before trusting a security finding. Both files were
regenerated with the shim and the JSON in this directory is from the good runs.

## Dropped

| id | why |
|---|---|
| `perf-image-format` | Not true for real visitors. The collector saw one JPEG served as JPEG. Shopify's CDN negotiates on `Accept`, and a browser sending `image/webp` gets WebP: the homepage banner drops from 318 kB PNG to 40 kB WebP at width=750, and five sampled product images returned WebP at 11 to 21 kB. The single `MC6061-BRN_2.jpg` at 123 kB is an outlier asset, not a pipeline fault. Reporting this would have been wrong and the client's developer would have known it. |
| `perf-failed-requests` | A 403 from `https://shop.app/pay/hop`, Shopify's own Shop Pay handoff, on all five pages. Cannot be demonstrated to affect a real visitor from here and may be our proxy or a geo restriction. Not this site's defect. |

## Certificate findings: all discarded

`security.json` reports `pages[].tls.issuer: "Anthropic"`, subject `*.com.pk`,
30 days remaining. That is the agent proxy's certificate, not the site's. Every
certificate and expiry claim was dropped and the generated report was checked by
hand for a "valid for another N days" line.

## Timing caveats carried into the report's limits section

- **TTFB flatters the site.** Measured 46 to 58 ms. `server-timing` on the live
  responses shows `edge;desc="IAD"`, `country;desc="US"` and `x-dc: gcp-us-east1`,
  so this container sat next to the Cloudflare edge serving it. Engine's customers
  are in Pakistan. Page-to-page comparison is sound; the absolute number is not,
  and a real visitor is slower rather than faster.
- **Absolute TBT is not reliable here.** It tracks this container's shared CPU.
  README's check is to compare `resourceSummary.byKind.script` against a previous
  run, and this is the first run of this site, so that check cannot be discharged.
  The findings were kept because the comparisons that carry the argument are
  internally controlled, meaning same machine, same run: mobile against desktop,
  and the category page against the product page at near-identical script payload.
  The report states the ranking as reliable and the absolute figure as not.
- **The cart was empty.** CLS 0.103 on `/cart` was measured on an empty cart,
  since adding an item is an active step we are not authorised to take. A cart
  with items in it was not measured.

## Findings written by hand, not by a collector

- **No `<h1>` on any category page.** `seo-h1-missing` fired only for
  `/collections/new-arrivals`. Checked nine collection pages by hand and all nine
  have zero `<h1>`. The visible category name is an `<h6>` styled as an h2:
  `<h6 class="title--template--...__banner h2 leading-tight ...">Men</h6>`.
  The hand-checked version is the stronger finding and is the one reported.
- **The homepage `<h1>` is the logo wrapper.** Its first child is a 6.4 kB
  `<style data-shopify>` block, so the element's text content is CSS. Stripped of
  tags and style the h1 holds no text at all, only four copies of the logo image
  with `alt="EngineClothing"`.
- **Category page markup weight.** 6.3 MB of HTML decompressed, 23,017 elements,
  100 product cards. Note it compresses to 160 kB over the wire, so this is a
  parse and layout cost on the phone, not a bandwidth cost. Do not let the report
  imply visitors download 6 MB, because they do not.
- **Four Google tag containers.** G-WHWZC8WS42, AW-457208939 (twice, once with
  `&cx=c&gtm=4e6992`) and GT-NGPQKXM6, 630 kB between them.
- **Floating WhatsApp button.** `div.czm-button`, 60x60 px, `position: fixed`,
  z-index 998, at (332, 835) in a 412x915 viewport. Measured overlap with a
  product card's quick-add control is 28x10 px, and `elementFromPoint` at the
  control's centre still returns the control, so it is clipped rather than
  blocked. In the footer it covers the LinkedIn icon completely. Reported as a
  low-severity trim, deliberately not as "it blocks add to cart", which the
  measurement does not support.
- **Empty cart page.** "Not sure where to start? Try these collections:" is
  followed by no collections, only a "Continue shopping" button.

## Not reported

- Cookie flags. `_shopify_y`, `_shopify_s` and `localization` carry no `Secure`
  or `HttpOnly`. They are Shopify's own analytics identifiers and the session
  cookie `_shopify_essential` is correctly `HttpOnly; Secure`. Not the client's
  to change and no demonstrable harm.
- The "FLAT 50% OFF, SEPT. 1ST TO SEPT. 13TH ONLY" hero banner expires today.
  Mentioned to the client as an aside, not as a finding. One run cannot show
  whether stale banners are a habit.

## Correction, 13 September 2026: the LCP headline was framed wrong

The client questioned the fourteen-second figure, having loaded
`/collections/new-arrivals` themselves and seen four to five seconds. They were
right and the report was corrected.

`collect-perf.mjs`'s mobile profile is Lighthouse's standard preset:
`cpuThrottle: 4`, 1.6 Mbps down, 750 kbps up, 150 ms latency, cold cache. That
is a deliberately pessimistic stress case, and the first draft reported its
output as though it were a typical visit ("On a mid-range Android phone the
category pages took around fourteen seconds"). A client who tests on their own
phone on wifi sees a third of that and concludes the report is padded.

Decomposed the same page, median of 3 cold loads each:

  4x CPU + slow 4G (as reported)   15.58 s
  slow 4G, no CPU throttle         11.75 s
  fast connection, 2x CPU           6.19 s
  fast connection, no throttle       4.01 s
  desktop, no throttle               4.01 s

Note also that the 4x throttle sits on top of this container's CPU, a shared
2.1 GHz Xeon core that took 2,024 ms for 300M integer adds. README warns about
this for TBT. It applies to LCP too whenever the page is CPU-bound, and a page
with 23,017 elements and 2.2 MB of JavaScript is exactly that, so the emulated
device is slower than a real Moto G play rather than equivalent to one.

Re-measured every page unthrottled, phone viewport, 30 Mbps / 30 ms:

  /                          LCP 1.36 s   FCP 1.31 s
  /collections/men           LCP 3.68 s   FCP 2.20 s
  /collections/new-arrivals  LCP 4.01 s   FCP 2.44 s
  /products/kt6147-nvy       LCP 1.37 s   FCP 1.30 s

**The finding survives and is cleaner for it.** The category pages are still the
slowest on the site by roughly two and a half times, and still sit above
Google's 2.50 s threshold, while the home page and product pages clear it
comfortably. That makes the problem specific to the category template, which is
the argument the report wanted to make anyway. Both columns now appear in the
evidence block and the summary leads with the unthrottled figure.

Lesson for the next run: **`--all-profiles` gives mobile and desktop, not
throttled and unthrottled.** The desktop profile removes the CPU throttle and
the network throttle together, so it cannot separate "slow because the phone is
weak" from "slow because the connection is weak", and neither profile shows
what the site does on a phone on wifi, which is what the client will test. Run
the unthrottled phone case as a third measurement before writing the headline.
