# Website audit: PriceOye

13 September 2026 · prepared by Owais Khan
Pages tested: https://priceoye.pk/, https://priceoye.pk/mobiles, https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16, https://priceoye.pk/wireless-earbuds, https://priceoye.pk/mobiles/pricelist/budget-4g-phones, https://priceoye.pk/mobiles/compare/samsung-galaxy-a37-5g-vs-samsung-galaxy-a57-5g, https://priceoye.pk/sale

## Summary

We looked at PriceOye from the outside, the way any shopper's browser sees it: the home page, two category listings, a product page, a comparison page and one price-list page, tested on a laptop and on a mid-range Android phone over a typical mobile connection. We did not log in and we did not test anything a normal visitor could not reach.

The site is in good shape on the things that most often go wrong. It loads over a secure connection, redirects insecure requests, sets the main protective headers, keeps its sign-in cookies locked down, compresses what it sends, and every page we checked is set up to be found in search. Nothing suggests the site has been attacked or is leaking anything it should not.

The clearest problem is one page type: the price-list pages. The one we tested takes three to four seconds just for the server to answer, and roughly twelve seconds before its content is usable on a phone, while also showing phones that were discontinued and last updated in 2023. The home page also jumps around as it loads, which is untidy and costs a little in search ranking. The rest are smaller, cheaper fixes: the sale page wears the home page's name in Google, two of the most important page types are missing their main heading, and images are sent at larger sizes than they are shown.

In total: two things worth doing soon, and a short list of quick wins that make the site tidier and easier to find. None of it is an emergency.

2 high · 12 medium · 18 low · 1 info

## What we measured

- `https://priceoye.pk/` (desktop): LCP 700 ms, CLS 0.314, TBT 460 ms, TTFB 341 ms, 44142 kB over 264 requests
- `https://priceoye.pk/mobiles` (mobile): LCP 2.57 s, CLS 0.031, TBT 1.49 s, TTFB 279 ms, 3799 kB over 112 requests
- `https://priceoye.pk/mobiles` (desktop): LCP 600 ms, CLS 0.001, TBT 158 ms, TTFB 351 ms, 3800 kB over 111 requests
- `https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16` (mobile): LCP 2.74 s, CLS 0.005, TBT 1.60 s, TTFB 229 ms, 3052 kB over 75 requests
- `https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16` (desktop): LCP 340 ms, CLS 0.001, TBT 183 ms, TTFB 168 ms, 3080 kB over 80 requests
- `https://priceoye.pk/wireless-earbuds` (mobile): LCP 2.55 s, CLS 0.024, TBT 1.29 s, TTFB 676 ms, 4898 kB over 101 requests
- `https://priceoye.pk/wireless-earbuds` (desktop): LCP 932 ms, CLS 0.000, TBT 165 ms, TTFB 748 ms, 4809 kB over 100 requests
- `https://priceoye.pk/mobiles/pricelist/budget-4g-phones` (mobile): LCP 12.78 s, CLS 0.003, TBT 1.20 s, TTFB 3.43 s, 2742 kB over 66 requests
- `https://priceoye.pk/mobiles/pricelist/budget-4g-phones` (desktop): LCP 10.50 s, CLS 0.001, TBT 94 ms, TTFB 10.13 s, 2965 kB over 65 requests
- `https://priceoye.pk/mobiles/compare/samsung-galaxy-a37-5g-vs-samsung-galaxy-a57-5g` (mobile): LCP 3.30 s, CLS 0.002, TBT 917 ms, TTFB 772 ms, 2031 kB over 45 requests
- `https://priceoye.pk/mobiles/compare/samsung-galaxy-a37-5g-vs-samsung-galaxy-a57-5g` (desktop): LCP 1.15 s, CLS 0.002, TBT 22 ms, TTFB 910 ms, 2044 kB over 52 requests

## How this was measured, and what it limits

This audit was run from a data centre, not a phone, and the site could only be
reached through a local relay (PriceOye's CDN requires TLS 1.3, which this
environment's browser cannot negotiate directly). The relay loads every page
correctly but adds some latency and decompresses responses, so:

- **Absolute mobile timings are upper bounds.** The real figures on a phone are
  a little faster. The server-response times (TTFB) were re-checked independently
  with `curl` and match, so the slow price-list page is real; the borderline
  mobile LCP figures (around 2.5 to 3.3 s on the listings) may sit just under
  their threshold in practice.
- **Page-to-page comparison, layout shift (CLS) and every SEO and header finding
  are unaffected** by the relay and stand as measured.
- **Total Blocking Time and the total-transfer figures are not reported.** TBT
  tracks this machine's shared CPU rather than a visitor's phone, and the
  transfer totals in the table above are decompressed sizes, not what goes over
  the wire (the site does compress, with Brotli). Treat both as diagnostic only.
- **No certificate finding is included.** The certificate this environment sees
  is the proxy's, not the site's, so it cannot be judged.

## What is working well

- The site is served over HTTPS.
- Plain HTTP correctly redirects to HTTPS.
- HSTS is configured.
- No credentials were found in the JavaScript served to visitors.
- Session cookies are set HttpOnly and Secure.
- Every page is set up to display properly on phones.
- Every page declares the language it is written in.
- The site publishes structured data, which helps search engines understand what it offers.
- Nothing on the site tells search engines to stay away, so every page tested is free to be listed.
- A robots.txt is published.
- A sitemap is declared in robots.txt, which helps search engines find every page.
- All 30 internal links we followed resolved without an error or a redirect chain.

## Findings

### Main content takes too long to appear (LCP 12.78 s)  
`[High · Quick fix]`

**What we found.**
```
LCP 12.78 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 12.78 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### Server is slow to respond (TTFB 3.43 s)  
`[High · Moderate]`

**What we found.**
```
TTFB 3.43 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 800 ms.
```

**Why it matters.** The server takes 3.43 s to send the first byte, before the browser can begin any work at all. Everything else on the page is delayed by this amount.

**How to fix it.** Cache the response at the edge where the page allows it, check for per-request database work that could be cached or batched, and check whether a serverless cold start is responsible.

### Main content takes too long to appear (LCP 2.57 s)  
`[Medium · Quick fix]`

**What we found.**
```
LCP 2.57 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 2.57 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### 17 image(s) are far larger than the space they are shown in  
`[Medium · Quick fix]`

**What we found.**
```
https://images.priceoye.pk/banners/pakistan-priceoye-slider-27h78.jpg
    1097×411 delivered, drawn at 412×154, 156 kB
https://images.priceoye.pk/banners/pakistan-priceoye-slider-0euao.jpg
    1097×411 delivered, drawn at 412×154, 68 kB
https://images.priceoye.pk/banners/pakistan-priceoye-slider-zbstm.webp
    1097×411 delivered, drawn at 412×154, 33 kB
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 120×48, 4 kB
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 77×48, 4 kB
```

**Why it matters.** About 300 kB is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.

**How to fix it.** Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.

### Main content takes too long to appear (LCP 2.74 s)  
`[Medium · Quick fix]`

**What we found.**
```
LCP 2.74 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 2.74 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### 19 image(s) are far larger than the space they are shown in  
`[Medium · Quick fix]`

**What we found.**
```
https://images.priceoye.pk/samsung-galaxy-a25-pakistan-priceoye-eyans-270x270.webp
    270×270 delivered, drawn at 100×100, 7 kB
https://images.priceoye.pk/awei-ka19-portable-outdoor-bluetooth-speaker-pakistan-priceoye-wpd4n-270x270.webp
    270×270 delivered, drawn at 100×100, 7 kB
https://images.priceoye.pk/oraimo-watch-5r-smart-watch-osw-820-pakistan-priceoye-s1f35-270x270.webp
    270×270 delivered, drawn at 100×100, 6 kB
https://images.priceoye.pk/samsung-galaxy-a15-pakistan-priceoye-eaiki-270x270.webp
    270×270 delivered, drawn at 100×100, 4 kB
https://images.priceoye.pk/toocki-tct1c-jcd01-20w-gan-usb-c-fast-charging-power-adapter-pakistan-priceoye-asz67-270x270.webp
    270×270 delivered, drawn at 100×100, 4 kB
```

**Why it matters.** About 61 kB is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.

**How to fix it.** Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.

### Main content takes too long to appear (LCP 2.55 s)  
`[Medium · Quick fix]`

**What we found.**
```
LCP 2.55 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 2.55 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### 24 image(s) are far larger than the space they are shown in  
`[Medium · Quick fix]`

**What we found.**
```
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 120×48, 4 kB
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 77×48, 4 kB
https://images.priceoye.pk/badges/priceoye-sale-20260908-lp0gh.png
    90×26 delivered, drawn at 40×12, 3 kB
https://images.priceoye.pk/badges/priceoye-sale-20260908-lp0gh.png
    90×26 delivered, drawn at 40×12, 3 kB
https://images.priceoye.pk/badges/priceoye-sale-20260908-lp0gh.png
    90×26 delivered, drawn at 40×12, 3 kB
```

**Why it matters.** About 75 kB is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.

**How to fix it.** Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.

### 19 image(s) are far larger than the space they are shown in  
`[Medium · Quick fix]`

**What we found.**
```
https://static.priceoye.pk/images/blist/mobiles-0.webp
    269×206 delivered, drawn at 119×91, 11 kB
https://static.priceoye.pk/images/blist/mobiles-0.webp
    269×206 delivered, drawn at 50×38, 11 kB
https://static.priceoye.pk/images/blist/mobiles-0.webp
    269×206 delivered, drawn at 50×38, 11 kB
https://static.priceoye.pk/images/blist/mobiles-0.webp
    269×206 delivered, drawn at 50×38, 11 kB
https://static.priceoye.pk/images/blist/mobiles-1.webp
    268×206 delivered, drawn at 50×38, 5 kB
```

**Why it matters.** About 108 kB is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.

**How to fix it.** Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.

### Main content takes too long to appear (LCP 3.30 s)  
`[Medium · Quick fix]`

**What we found.**
```
LCP 3.30 s, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 2.50 s.
```

**Why it matters.** On Moto G-class Android, 4G, the largest thing on screen finishes drawing after 3.30 s. Google treats anything over 2.5 seconds as poor; it affects both search ranking and how many visitors leave before the page is usable.

**How to fix it.** Identify the LCP element (recorded in perf.json as `lcpElement`) and shorten its path: serve it at the size it is displayed, in a modern format, without waiting on JavaScript or a render-blocking stylesheet.

### 4 image(s) are far larger than the space they are shown in  
`[Medium · Quick fix]`

**What we found.**
```
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 120×48, 4 kB
https://static.priceoye.pk/images/logo.svg
    300×63 delivered, drawn at 77×48, 4 kB
https://images.priceoye.pk/samsung-galaxy-a37-5g-pakistan-priceoye-y6eu2-270x270.webp
    270×270 delivered, drawn at 80×80, 3 kB
https://images.priceoye.pk/samsung-galaxy-a57-5g-pakistan-priceoye-ljv2z-270x270.webp
    270×270 delivered, drawn at 80×80, 3 kB
```

**Why it matters.** About 13 kB is downloaded and then thrown away by the browser scaling it down. Where one of these is the main image on the page, it is usually most of the delay before anything appears.

**How to fix it.** Serve each image at the size it is displayed (with 2× variants for high-density screens) in WebP or AVIF. In a Next.js codebase this is usually replacing an `<img>` with `next/image`, which does the resizing and format selection automatically.

### Content-Security-Policy is not set, and the site has signed-in users  
`[Medium · Quick fix]`

**What we found.**
```
Response headers for https://priceoye.pk/ contain no `content-security-policy`.
The site has a login form or session cookie, which is what raises this above hygiene.
```

**Why it matters.** There is no second line of defence if a cross-site scripting bug is ever introduced: any injected script runs with full access to the page.

**How to fix it.** Start with a report-only policy to find what the site actually loads, then enforce a policy that names the script sources you trust.

### The page has no main heading  
`[Medium · Quick fix]`

**What we found.**
```
No <h1> found on https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16. First heading is an <h3>: "Similar Mobiles to Samsung Galaxy A16".
```

**Why it matters.** The main heading tells both a search engine and a screen-reader user what the page is about. Styling text to look like a heading is not the same thing, because only the markup is read.

**How to fix it.** Mark the page’s main heading as `<h1>`. One per page.

### Several pages share the same title  
`[Medium · Moderate]`

**What we found.**
```
"Lowest Mobile Price In Pakistan - Priceoye" is the title of 2 pages:
    https://priceoye.pk/
    https://priceoye.pk/sale
```

**Why it matters.** Search engines use the title to tell pages apart. When several are identical they compete with each other for the same searches, and the one that wins is not necessarily the one you would choose.

**How to fix it.** Give each page a title naming what is specific to it, such as the product, the category or the location, before the business name.


## What we would do first

**This week.** Fix the price-list pages. Find out why the server takes three to four seconds to answer them and bring that down to well under a second like the rest of the site, and refresh their content so they stop listing discontinued products. This is the slowest, stalest thing a shopper can land on. Then give the sale page its own title and description so it stops appearing in Google as a copy of the home page.

**Next.** Steady the home page as it loads by reserving space for images before they arrive, so the page stops shifting under the reader. Add a single main heading to the product and comparison pages. Serve images at the size they are actually shown, in a modern format.

**Later, if worth it.** Add a Content-Security-Policy and a Referrer-Policy, tidy the extra headings on the home page, shorten the few titles and descriptions that are cut off in search results, and fix the one missing image on the price-list page.

**What we did not test.** Anything behind the login, and the source code, which we did not have. We tested six pages out of a very large catalogue, chosen as the ones a shopper is most likely to move through, so treat the page-level findings as representative of their page types rather than a list of every affected URL.

## Appendix: hygiene

- **5 files block the page from drawing anything** `[Low]`: Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.
- **1 large image(s) use an older format** `[Low]`: Convert these to WebP (or AVIF with a WebP fallback), or serve them through an image CDN that negotiates the format per browser.
- **1 web font file(s), 43 kB, text hidden while they load** `[Low]`: Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **5 files block the page from drawing anything** `[Low]`: Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.
- **1 web font file(s), 43 kB, text hidden while they load** `[Low]`: Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **5 files block the page from drawing anything** `[Low]`: Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.
- **1 web font file(s), 43 kB, text hidden while they load** `[Low]`: Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **4 files block the page from drawing anything** `[Low]`: Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.
- **1 request(s) on the page fail** `[Low]`: Remove or correct the references. Where the file should exist, check whether it is missing from the deployed build.
- **3 files block the page from drawing anything** `[Low]`: Add `defer` to scripts that are not needed for first paint, inline the small amount of CSS the top of the page needs and load the rest asynchronously, and move third-party tags out of the critical path.
- **9 web font file(s), 215 kB, text hidden while they load** `[Low]`: Set `font-display: swap`, self-host rather than loading from a third-party origin, preload only the one or two faces used above the fold, and drop weights the design does not actually use.
- **2 standard security header(s) are not set** `[Low]`: Set them once at the edge or in middleware so every response carries them: Start with a report-only policy to find what the site actually loads, then enforce a policy that names the script sources you trust. Send `Referrer-Policy: strict-origin-when-cross-origin`.
- **The search-result description is cut off** `[Low]`: Trim to under 160 characters.
- **The page has several main headings** `[Low]`: Keep one `<h1>` and demote the rest to `<h2>`.
- **Heading levels skip a step** `[Low]`: Choose heading levels by position in the outline, not by how large you want the text to look. Set size with CSS.
- **The page title is cut off in search results** `[Low]`: Shorten to under 60 characters, putting the words that distinguish this page first and the business name last.
- **Some images have no text alternative** `[Low]`: Add `alt` text describing what the image shows. For decorative images, add `alt=""` explicitly so assistive technology knows to skip them.
- **Several pages share the same search-result description** `[Low]`: Write a description per page, or generate one from the page’s own content.
- **A page has very little text** `[Info]`: If this page is meant to bring in search traffic, expand it to answer the questions a customer would actually ask. If it is not, no action needed.

## Appendix: how to reproduce these figures

```
node collect-perf.mjs https://priceoye.pk/ https://priceoye.pk/mobiles https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16 https://priceoye.pk/wireless-earbuds https://priceoye.pk/mobiles/pricelist/budget-4g-phones https://priceoye.pk/mobiles/compare/samsung-galaxy-a37-5g-vs-samsung-galaxy-a57-5g --runs 3 --all-profiles
node check-headers.mjs https://priceoye.pk/ https://priceoye.pk/mobiles https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16
node check-seo.mjs https://priceoye.pk/ https://priceoye.pk/mobiles https://priceoye.pk/mobiles/samsung/samsung-galaxy-a16 https://priceoye.pk/wireless-earbuds https://priceoye.pk/mobiles/pricelist/budget-4g-phones https://priceoye.pk/mobiles/compare/samsung-galaxy-a37-5g-vs-samsung-galaxy-a57-5g https://priceoye.pk/sale
```
