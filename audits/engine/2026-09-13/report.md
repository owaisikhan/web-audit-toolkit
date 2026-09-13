# Website audit: Engine Clothing

13 September 2026 · prepared by Owais Khan
Pages tested: https://engine.com.pk/, https://engine.com.pk/collections/new-arrivals, https://engine.com.pk/collections/men, https://engine.com.pk/products/kt6147-nvy, https://engine.com.pk/cart

## Summary

We measured five pages of engine.com.pk as an ordinary shopper's phone and laptop would load them: the home page, two category pages, a product page and the cart. Nothing suggests the site has been attacked or that customer data is exposed, and the security settings Shopify gives you are switched on and working. The problem is speed, and it is concentrated exactly where it costs you money. The category pages are the slowest thing on the site: on a good connection they take about four seconds to show their main content, against about one and a half seconds for the home page and a product page, and on a mid-range Android phone over a weak mobile signal that stretches to about fourteen. Those category pages are where a shopper arriving from an ad or a search decides whether to keep going. The cause is not your photographs, which are handled well: every page loads roughly 2.2 megabytes of code before it can finish, and more than half of that is advertising and analytics tags rather than anything belonging to the shop. We found four separate Google tracking containers running side by side on a single page. Alongside that, your category pages are missing the one piece of markup that tells Google what the page is about, which is a plain fix and a quick one.

We recorded fourteen issues worth acting on. Three of them account for almost all of the harm, and the first week's work is one afternoon of measurement and one change to the tracking setup.

1 medium · 5 low

## What we measured

- `https://engine.com.pk/` (mobile): LCP 8.34 s, CLS 0.002, TBT 2.32 s, TTFB 53 ms, 3286 kB over 278 requests
- `https://engine.com.pk/` (desktop): LCP 1.24 s, CLS 0.016, TBT 176 ms, TTFB 48 ms, 3309 kB over 311 requests
- `https://engine.com.pk/collections/new-arrivals` (mobile): LCP 14.21 s, CLS 0.019, TBT 6.09 s, TTFB 55 ms, 3956 kB over 272 requests
- `https://engine.com.pk/collections/new-arrivals` (desktop): LCP 4.21 s, CLS 0.004, TBT 954 ms, TTFB 55 ms, 3569 kB over 327 requests
- `https://engine.com.pk/collections/men` (mobile): LCP 14.28 s, CLS 0.019, TBT 6.93 s, TTFB 54 ms, 3733 kB over 270 requests
- `https://engine.com.pk/collections/men` (desktop): LCP 4.06 s, CLS 0.004, TBT 1.11 s, TTFB 48 ms, 3604 kB over 327 requests
- `https://engine.com.pk/products/kt6147-nvy` (mobile): LCP 3.80 s, CLS 0.001, TBT 1.86 s, TTFB 46 ms, 2996 kB over 285 requests
- `https://engine.com.pk/products/kt6147-nvy` (desktop): LCP 1.52 s, CLS 0.019, TBT 169 ms, TTFB 58 ms, 3242 kB over 344 requests
- `https://engine.com.pk/cart` (mobile): LCP 3.06 s, CLS 0.103, TBT 1.30 s, TTFB 52 ms, 2452 kB over 247 requests
- `https://engine.com.pk/cart` (desktop): LCP 1.28 s, CLS 0.016, TBT 78 ms, TTFB 52 ms, 2653 kB over 279 requests

## What is working well

- The site is served over HTTPS.
- Plain HTTP correctly redirects to HTTPS.
- HSTS is configured.
- A Content-Security-Policy is set: it forces every request onto HTTPS and stops other sites embedding your pages in a frame.
- No credentials were found in the JavaScript served to visitors.
- Every page is set up to display properly on phones.
- Every page declares the language it is written in.
- The site publishes structured data, which helps search engines understand what it offers.
- All 521 images we saw carry a text alternative.
- Nothing on the site tells search engines to stay away, so every page tested is free to be listed.
- A robots.txt is published.
- A sitemap is declared in robots.txt, which helps search engines find every page.
- All 30 internal links we followed resolved without an error or a redirect chain.

## Findings

### Category pages are the slowest pages on the site, on any connection  
`[High · Moderate]`

**What we found.**
```
LCP is the moment the largest thing on screen finishes drawing. Median of 3
cold loads, phone viewport, measured two ways:

                              good connection      weak mobile signal
                              30 Mbps, 30 ms       1.6 Mbps, 150 ms, 4x CPU

  /collections/new-arrivals        4.01 s               14.21 s
  /collections/men                 3.68 s               14.28 s
  /                                1.36 s                8.34 s
  /products/kt6147-nvy             1.37 s                3.80 s

Google treats anything over 2.50 s as poor.

The right-hand column is the standard mobile stress test, the same preset
Google's PageSpeed Insights scores a site on: a throttled mid-range Android on
a weak 4G signal with an empty cache. It is a deliberately pessimistic case,
not a typical visit. The left-hand column is the same pages with the throttling
removed, which is closer to what you see testing the site yourself on wifi.

Both columns rank the pages the same way, and the category pages are the
slowest either way. Decomposing the weak-signal figure for
/collections/new-arrivals:

  4x CPU throttle + slow 4G      15.58 s
  slow 4G, no CPU throttle       11.75 s
  fast connection, 2x CPU         6.19 s
  fast connection, no throttle     4.01 s
```

**Why it matters.** On a good connection these pages take about four seconds against about one and a half for your home page and your product pages, so they are roughly two and a half times slower than the rest of the site and they are the pages a shopper arriving from an ad or a search lands on. Four seconds is already past the two and a half that Google counts as good, and the home page and product pages clear that bar comfortably, so the gap is specific to the category template rather than to the site or the server. On a weak mobile signal the same pages stretch to about fourteen seconds, which is what the industry-standard mobile test reports and what Google's own PageSpeed score is based on. The two findings below are the cause of both figures.

**How to fix it.** Treat the two findings below as the work. Nothing about this page needs to be redesigned; it needs to arrive with less code and fewer things to lay out.

### Every page loads about 2.2 MB of code, and more than half of it is tracking tags  
`[High · Moderate]`

**What we found.**
```
Scripts requested on one load of /collections/men, grouped by where they come from:

  630 kB    4 files  www.googletagmanager.com
  210 kB   46 files  engine.com.pk            (your theme)
  195 kB    2 files  connect.facebook.net
  126 kB   30 files  cdn.shopify.com
   74 kB    1 file   shopify-emailbot.s3.amazonaws.com
   49 kB    2 files  sc-static.net            (Snapchat)
   38 kB    2 files  cdnjs.cloudflare.com     (Font Awesome)
   30 kB    1 file   code.jquery.com
                     tr.snapchat.com, intg.snapchat.com

The four Google files are four separate tag containers running side by side:

  G-WHWZC8WS42     174 kB
  AW-457208939     160 kB
  AW-457208939     160 kB   (loaded a second time with &cx=c&gtm=4e6992)
  GT-NGPQKXM6      149 kB

Across all five pages measured: 2220 to 2411 kB of JavaScript per page view,
167 to 191 separate files, of which roughly 1200 kB is third-party.
```

**Why it matters.** Every one of those files has to be fetched, parsed and run on the main thread, and while that is happening the page cannot respond to a tap. The load is almost identical on every page, including the cart, so a shopper pays it again at each step. Your own theme code is 210 kB of the total. The rest is measurement and advertising, and the same advertising ID is being loaded twice on a single page view, which cannot be deliberate.

**How to fix it.** Start with the Google containers. Find out which of the four is still feeding a report somebody actually reads, consolidate the rest into it, and remove the duplicate AW-457208939 load. Then do the same for the others: a Facebook pixel, a Snapchat pixel, an email bot and a push-notification service are each defensible on their own, but they are worth keeping only if somebody is reading the numbers they produce. This is configuration work in the Shopify admin and the tag manager rather than theme development, and it is the largest single improvement available.

### A category page arrives as 23,000 elements for the phone to lay out  
`[High · Moderate]`

**What we found.**
```
https://engine.com.pk/collections/men, one request:

  160 kB      transferred over the network (compressed)
  6,344,627   bytes of HTML once decompressed
  23,017      HTML elements
  100         product cards on the page (the category holds 1,395 products)

What that HTML is made of:

  1,321,539 bytes (20.8%)  class attributes, 16,078 of them
    996,255 bytes (15.7%)  inline <script> blocks, 659 of them
    807,757 bytes (12.7%)  inline SVG, 1,804 of them
    175,953 bytes ( 2.8%)  inline <style> blocks, 341 of them

For comparison, the home page is 3,567 elements and a product page is 2,925.

Blocking time on the same machine in the same run, mobile profile:

  /collections/men       6.93 s   (2273 kB of JavaScript)
  /products/kt6147-nvy   1.86 s   (2411 kB of JavaScript)

The product page loads slightly more JavaScript and blocks for roughly a
quarter as long. The difference is the size of the page being laid out.
```

**Why it matters.** Bandwidth is not the problem here: compressed, the page is a reasonable 160 kB. The cost is what the phone does after it arrives. Building and laying out 23,000 elements is work that happens on the same main thread as everything else, and it is why the category pages block for far longer than the product page despite loading the same scripts.

**How to fix it.** Two options, and they combine. Show fewer products per page, since a hundred at once is more than anyone scrolls in one sitting and Shopify paginates this for you. And trim what each product card carries: 16,078 class attributes and 1,804 inline SVGs across a hundred cards means roughly 160 classes and 18 icons per card, so factoring the repeated icons into a sprite or a shared symbol reference would remove a large share of the markup on its own.

### No category page has a main heading  
`[Medium · Quick fix]`

**What we found.**
```
Number of <h1> elements, checked by hand on nine category pages:

  /collections/men            0
  /collections/women          0
  /collections/new-arrivals   0
  /collections/men-tops       0
  /collections/women-tops-1   0
  /collections/junior-boys    0
  /collections/baby-girl      0
  /collections/sale-men       0
  /collections/men-bottoms    0

The visible category name is marked up as the smallest heading level there is,
styled to look like a large one:

  <h6 class="title--template--22340460183803__banner h2 leading-tight ltr
             text-center rtl:text-center">Men</h6>

Headings present on /collections/men: one <h2> reading "Related collections",
one <h6> reading "Men". No <h1>, <h3>, <h4> or <h5>.
```

**Why it matters.** A page's main heading is one of the strongest signals a search engine has about what the page is for, and these are the pages that should be winning searches for things like men's casual shirts. At the moment your "Men" page announces its subject at the lowest priority the format allows, and the page technically has no main heading at all. Your titles and search descriptions are genuinely well written, so this is the one piece missing from an otherwise careful setup.

**How to fix it.** In the collection banner section of the theme, change the `<h6>` to an `<h1>`. The class list already contains "h2", which is what controls how it looks, so the appearance will not change. Do it once in the banner template and it corrects every category page at the same time.

### The home page main heading contains stylesheet code instead of words  
`[Medium · Quick fix]`

**What we found.**
```
The home page has exactly one <h1>. It wraps the logo, and its first
child is a stylesheet block:

  <h1 class="flex logo-name p-break-words lg:order-2 ...">
    <style data-shopify>
      #sticky-header-content .logo-normal,
      #sticky-header-content:hover .logo-transparent,
      ...
    </style>
    <img src="...Engine_New_Logo-2026_white.png" alt="EngineClothing" ...>
    ...

The element is 6,486 bytes, of which the style block is about 6.4 kB. Strip the
tags and the style out and the heading contains no text whatsoever, only four
copies of the logo image carrying alt="EngineClothing".
```

**Why it matters.** Anything reading the page for its main heading, a search engine or a screen reader, finds either nothing or a block of CSS where the page's subject should be. The alt text gives it your brand name, which it already has from the title. It does not say what the page offers.

**How to fix it.** Move the `<style data-shopify>` block out of the `<h1>` and into the section wrapper around it, which changes nothing visually. Then decide what the home page's main heading should say. If the logo is to stay the h1, the alt text is the heading, so make it describe the shop rather than repeat the brand.

### Page content shifts while loading (CLS 0.103)  
`[Medium · Quick fix]`

**What we found.**
```
CLS 0.103, median of 3 cold loads, Moto G-class Android, 4G. Threshold for "good" is 0.1.
```

**Why it matters.** Content moves by 0.103 of the screen after it first appears, which is what makes people tap the wrong thing. Google treats anything over 0.1 as poor.

**How to fix it.** Reserve space for anything that arrives late: width and height attributes (or aspect-ratio) on every image, a fixed height for ad and embed slots, and font-display settings that do not swap in a differently-sized face.


### Four files delay the first paint, and two third-party files arrive uncompressed  
`[Low · Quick fix]`

**What we found.**
```
Render-blocking on /collections/men (about 40 kB, must arrive and run
before anything is drawn):

  <link> engine.com.pk/cdn/shop/t/62/assets/theme.css
  <link> engine.com.pk/cdn/shop/t/62/assets/secondary-css.css
  <link> engine.com.pk/cdn/shop/t/62/assets/baadmay-styles.css
  <link> cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/fontawesome.min.css

Served with no content-encoding, on every page:

  shopify-emailbot.s3.amazonaws.com/email-bot/email-bot-theme-file/index.js   74 kB
  api.prod.pushbot.app/settings                                                3 kB

Served with no cache-control, so it is re-fetched every visit:

  tr.snapchat.com/config/pk/03b4b3e7-8624-406a-ab17-009c741f8ffc.js
```

**Why it matters.** Small next to the two big findings above, but they are on the same path. The Font Awesome stylesheet in particular is a fourth separate server the browser has to connect to before it can draw, and 74 kB of uncompressed JavaScript is roughly three times what it would cost compressed.

**How to fix it.** Font Awesome is the one worth acting on: serve it from your own theme assets alongside the other stylesheets rather than from a third CDN, or drop it if the theme's own icons cover what you use. The uncompressed and uncached files belong to the email bot, the push service and Snapchat, so they are not yours to fix directly, but they are a fair reason to drop those apps if the tag audit above finds nobody is using them.

### The floating WhatsApp button sits on top of page controls  
`[Low · Quick fix]`

**What we found.**
```
Measured in a 412x915 phone viewport:

  div.czm-button   position: fixed   z-index: 998
                   60x60 px at x=332, y=835

On /collections/men it overlaps a product card's quick-add control by 28x10 px.
The control's centre is still clickable, so it is clipped rather than blocked.
On /cart the same button completely covers the LinkedIn icon in the footer row
of social links (see the phone screenshot of the cart page).
```

**Why it matters.** The button is anchored to the bottom-right corner, which is where this theme also puts the add-to-cart control on each product card, so as a shopper scrolls it passes over one card control after another. Nothing is unreachable, but a shopper who taps the corner of a card button and opens WhatsApp instead has been interrupted at exactly the moment they decided to buy.

**How to fix it.** Raise the button by roughly the height of one card control, or shift it inward from the right edge, so its 60x60 area no longer crosses the corner where the card buttons sit. If the theme allows a per-template position, moving it on collection pages alone is enough.

### The empty cart page offers collections and then lists none  
`[Low · Quick fix]`

**What we found.**
```
https://engine.com.pk/cart with nothing in the cart reads:

  Your cart is empty
  Not sure where to start?
  Try these collections:
  [ Continue shopping ]

No collections follow the invitation. See the phone screenshot of the cart page.
```

**Why it matters.** Someone reaching an empty cart is a shopper who was interested and lost the thread, and this is the one screen where a few category links do obvious work. The page asks them to try some collections and then gives them a single generic button instead.

**How to fix it.** Either list three or four collections under that line, which is what the theme setting expects, or change the wording so it does not promise a list. The first is worth more.

## What we would do first

**This week.** Audit the tracking tags and remove the duplicates. Four Google containers, a Facebook pixel, a Snapchat pixel, an email bot and a separate push-notification service are all loading on every page, and together they are more than half the code a shopper's phone has to get through before the page settles. Most shops running this many tags are running two or three they no longer use. Work out which ones are still feeding a report somebody reads, then delete the rest and consolidate what remains into a single container. This needs no theme development and it is the single largest change available to you.

**Next.** Reduce what a category page has to build. Each one currently arrives with a hundred products' worth of markup, about twenty-three thousand elements, and a phone has to lay all of that out before it can show anything. Showing fewer products per page, or trimming the markup each product card carries, is theme work of a few days and it targets that gap directly. In the same pass, give every category page a proper main heading. At the moment the category name is marked up as the least important heading level available and the pages have no main heading at all, which makes it harder for Google to tell that your "Men" page is about men's clothing. That part is an afternoon.

**Later, if worth it.** Set a Referrer-Policy header and stop publishing the original source of seven theme scripts, both of which are hygiene rather than exposure. Move the floating WhatsApp button clear of the product card controls it currently clips. Fix the empty cart page, which invites the shopper to "try these collections" and then lists none. The cart page also shifts as it loads, slightly past the point where Google counts it against you.

**What we did not test.** This was a passive audit of the public shop with no access to your Shopify admin, your theme source or any logged-in page, so we tested nothing behind a login, nothing in the checkout past the cart, and we did not add an item to a cart or submit any form. We measured from a data centre that happens to sit beside the server delivering your pages, which means the server response times we recorded are better than what a shopper in Karachi gets: the comparison between your pages is sound, the absolute figures are generous. A run from a Pakistani connection, and a look at the theme source, would sharpen the speed numbers and let us say which of the tracking tags are safe to remove rather than which ones merely look redundant.

## Appendix: hygiene

- **One security header is not set** `[Low]`: Send `Referrer-Policy: strict-origin-when-cross-origin` on every response.
- **The original source of seven theme scripts is published** `[Low]`: Stop emitting source maps in production builds, or upload them to the error-tracking service and block the `.map` paths at the edge.
- **The page title is cut off in search results** `[Low]`: Shorten to under 60 characters, putting the words that distinguish this page first and the business name last.
- **The search-result description is cut off** `[Low]`: Trim to under 160 characters.
- **Heading levels skip a step** `[Low]`: Choose heading levels by position in the outline, not by how large you want the text to look. Set size with CSS.

## Appendix: how to reproduce these figures

```
node collect-perf.mjs https://engine.com.pk/ https://engine.com.pk/collections/new-arrivals https://engine.com.pk/collections/men https://engine.com.pk/products/kt6147-nvy https://engine.com.pk/cart --runs 3 --all-profiles
node check-headers.mjs https://engine.com.pk/ https://engine.com.pk/collections/new-arrivals https://engine.com.pk/collections/men https://engine.com.pk/products/kt6147-nvy https://engine.com.pk/cart
node check-seo.mjs https://engine.com.pk/ https://engine.com.pk/collections/new-arrivals https://engine.com.pk/collections/men https://engine.com.pk/products/kt6147-nvy https://engine.com.pk/cart
```
