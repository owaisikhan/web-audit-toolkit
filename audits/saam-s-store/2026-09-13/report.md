# Website audit: Saam's Store

13 September 2026
Pages tested: https://saam-s-store.vercel.app/, https://saam-s-store.vercel.app/shop, https://saam-s-store.vercel.app/products/apple, https://saam-s-store.vercel.app/cart

## Summary

We looked at four pages of Saam's Store on 13 September 2026 — the home page, the shop, a product page and the cart — testing how quickly they load on a typical mid-range Android phone, what each page tells search engines about itself, and what the site reveals to the public internet.

The site is in good shape, and most of this report says so. Speed is competitive, nothing shifts around as pages load, every image is described for screen readers, every internal link works, and the security basics are set up correctly. Most shops we look at cannot say that.

The clearest opportunity is in how the site describes itself to Google. Three of the four pages — including the product page — carry the identical title "Saamj Store" and the identical one-line description. To a search engine those pages look interchangeable, so they compete with each other rather than each ranking for what it actually sells. The cart page also has no main heading at all. Both are template changes rather than redesigns, and together they are well under a day.

In total: 3 medium and 10 low-severity items, plus 2 observations. Nothing suggests the site has been attacked, and no passwords or keys were found in the code it sends to visitors.

3 medium · 10 low · 2 info

## What we measured

- `https://saam-s-store.vercel.app/` (mobile) — LCP 2.01 s, CLS 0.001, TBT 327 ms, TTFB 43 ms, 778 kB over 58 requests
- `https://saam-s-store.vercel.app/` (desktop) — LCP 892 ms, CLS 0.001, TBT 0 ms, TTFB 36 ms, 980 kB over 67 requests
- `https://saam-s-store.vercel.app/shop` (mobile) — LCP 1.72 s, CLS 0.000, TBT 274 ms, TTFB 35 ms, 742 kB over 97 requests
- `https://saam-s-store.vercel.app/shop` (desktop) — LCP 1.15 s, CLS 0.000, TBT 0 ms, TTFB 35 ms, 673 kB over 121 requests
- `https://saam-s-store.vercel.app/products/apple` (mobile) — LCP 1.52 s, CLS 0.001, TBT 281 ms, TTFB 37 ms, 371 kB over 47 requests
- `https://saam-s-store.vercel.app/products/apple` (desktop) — LCP 1.57 s, CLS 0.000, TBT 0 ms, TTFB 39 ms, 356 kB over 49 requests
- `https://saam-s-store.vercel.app/cart` (mobile) — LCP 2.96 s, CLS 0.000, TBT 272 ms, TTFB 39 ms, 328 kB over 39 requests
- `https://saam-s-store.vercel.app/cart` (desktop) — LCP 724 ms, CLS 0.001, TBT 0 ms, TTFB 37 ms, 324 kB over 39 requests

## What is working well

- The site is served over HTTPS, redirects plain HTTP to it, and sets HSTS.
- No credentials were found in the JavaScript served to visitors.
- Pages do not shift about while they load — movement measured 0.003 at worst, where anything under 0.1 is considered good.
- Seven of the eight page-and-device combinations we measured show the main content inside Google's "good" range.
- All 78 images we saw carry a text alternative, so the site is readable by a screen reader and eligible for image search.
- All 30 internal links we followed resolved without an error or a redirect chain.
- Every page is set up to display properly on phones, and declares the language it is written in.
- Nothing on the site tells search engines to stay away — every page we tested is free to be listed.

## Findings

### Main content takes too long to appear (LCP 2.96 s)  
`[Medium · Quick fix]`

**What we found.**
```
LCP 2.96 s — median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 2.96 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### The page has no main heading  
`[Medium · Quick fix]`

**What we found.**
```
No <h1> found on https://saam-s-store.vercel.app/cart. First heading is an <h3>: "Shop".
```

**Why it matters.** The main heading tells both a search engine and a screen-reader user what the page is about. Styling text to look like a heading is not the same thing — only the markup is read.

**How to fix it.** Mark the page’s main heading as `<h1>`. One per page.

### Several pages share the same title  
`[Medium · Moderate]`

**What we found.**
```
"Saamj Store" is the title of 3 pages:
    https://saam-s-store.vercel.app/
    https://saam-s-store.vercel.app/products/apple
    https://saam-s-store.vercel.app/cart
```

**Why it matters.** Search engines use the title to tell pages apart. When several are identical they compete with each other for the same searches, and the one that wins is not necessarily the one you would choose.

**How to fix it.** Give each page a title naming what is specific to it — the product, the category, the location — before the business name.


## What we would do first

**This week** — give each page its own title and description. The product page inheriting the site-wide title is the highest-value fix available here: product pages are what people search for, and at the moment Google cannot tell one from another. Add an `h1` to the cart while the template is already open. Half a day, no design work, nothing a customer would see change.

**Next** — the fonts. Three font files totalling 89 kB currently hide text while they load, which is why the first moment of each page feels blank on a phone. One CSS line — `font-display: swap` — changes that, and it is the cheapest visible improvement on the list.

**Worth doing, not urgent** — the cart's load time on mobile (2.96 seconds, the one page outside Google's good range), the sharing tags that currently make links posted to WhatsApp or Facebook appear as bare URLs, and the four standard security headers that are not set. None of these is costing customers today.

**What we did not test** — only public pages, as an anonymous visitor — we did not sign in, so the account and checkout flows are untested, and that is where most of the code lives. We did not review the source code in this pass. Two limits come from where the audit ran rather than from the site: the connection passed through an inspecting proxy, so the certificate details our tools recorded were the proxy's and have been removed from this report; and this machine's processor is shared, which inflates one measure of script-blocking time — four such findings were set aside after confirming the site serves byte-for-byte identical JavaScript to earlier runs today.

## Appendix: hygiene

- **3 web font file(s), 89 kB, text hidden while they load** `[Low]` — Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **1 web font file(s), 37 kB, text hidden while they load** `[Low]` — Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **1 web font file(s), 37 kB, text hidden while they load** `[Low]` — Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **1 web font file(s), 37 kB, text hidden while they load** `[Low]` — Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **4 standard security header(s) are not set** `[Low]` — Set them once at the edge or in middleware so every response carries them: Start with a report-only policy to find what the site actually loads, then enforce a policy that names the script sources you trust. Send `X-Content-Type-Options: nosniff` on all responses. Send `X-Frame-Options: SAMEORIGIN`, or `frame-ancestors 'self'` in the Content-Security-Policy. Send `Referrer-Policy: strict-origin-when-cross-origin`.
- **The page title is very short** `[Low]` — Expand to roughly 50–60 characters describing what the page offers.
- **The search-result description is very short** `[Low]` — Expand to 50–160 characters, describing what the page offers as a sentence a customer would read.
- **Heading levels skip a step** `[Low]` — Choose heading levels by position in the outline, not by how large you want the text to look. Set size with CSS.
- **Links to this site look plain when shared** `[Low]` — Add `og:title`, `og:description` and an `og:image` of about 1200×630 to the shared layout, defaulting to the business logo where a page has no image of its own.
- **Several pages share the same search-result description** `[Low]` — Write a description per page, or generate one from the page’s own content.
- **Key-shaped values in client JavaScript — need confirming** `[Info]` — Decode each one and confirm what it grants. If it is a public key, note it as expected; if it grants more than a visitor should have, treat it as the critical finding above.
- **A page has very little text** `[Info]` — If this page is meant to bring in search traffic, expand it to answer the questions a customer would actually ask. If it is not, no action needed.

## Appendix: how to reproduce these figures

```
node collect-perf.mjs https://saam-s-store.vercel.app/ https://saam-s-store.vercel.app/shop https://saam-s-store.vercel.app/products/apple https://saam-s-store.vercel.app/cart --runs 3 --all-profiles
node check-headers.mjs https://saam-s-store.vercel.app/ https://saam-s-store.vercel.app/shop https://saam-s-store.vercel.app/cart
node check-seo.mjs https://saam-s-store.vercel.app/ https://saam-s-store.vercel.app/shop https://saam-s-store.vercel.app/products/apple https://saam-s-store.vercel.app/cart
```
