# Website audit: badseo.dev

13 September 2026
Pages tested: https://badseo.dev/, https://badseo.dev/kitchen-sink, https://badseo.dev/index/noindex-header, https://badseo.dev/privacy, https://badseo.dev/head/missing-title, https://badseo.dev/head/title-too-long, https://badseo.dev/head/title-too-short, https://badseo.dev/head/missing-meta-description, https://badseo.dev/head/meta-description-too-long, https://badseo.dev/head/meta-description-too-short, https://badseo.dev/head/missing-h1, https://badseo.dev/head/empty-h1, https://badseo.dev/head/multiple-h1, https://badseo.dev/head/heading-order-skip, https://badseo.dev/content/thin-content, https://badseo.dev/content/images-missing-alt, https://badseo.dev/content/duplicate-a, https://badseo.dev/content/duplicate-b, https://badseo.dev/content/duplicate-title-a, https://badseo.dev/content/duplicate-title-b, https://badseo.dev/content/duplicate-meta-a, https://badseo.dev/content/duplicate-meta-b, https://badseo.dev/index/noindex-meta, https://badseo.dev/index/canonicalized, https://badseo.dev/index/canonical-conflict, https://badseo.dev/status/not-found, https://badseo.dev/status/server-error, https://badseo.dev/status/blocked, https://badseo.dev/links/broken-internal-link, https://badseo.dev/redirect/trailing-slash, https://badseo.dev/perf/slow-response, https://badseo.dev/structure/orphan, https://badseo.dev/structure/no-outgoing-links

## Summary

We looked at 33 pages of badseo.dev on 13 September 2026, testing what each page
tells search engines about itself and what the site reveals to the public
internet.

**This site is broken on purpose.** It is a test fixture: each page is built to
fail one specific check, and the sitemap names them accordingly. What follows
should be read as confirmation that the checks fire, not as a list of accidents
to go and fix.

Two results still look unintended. The site answers on an unencrypted
connection without sending visitors to the secure one — a safety matter rather
than a search one, and a single rule at the hosting layer. And two pages carry
an instruction telling search engines not to list them; correct here, but on a
live site this is the most expensive thing that can be wrong, and it is the
first thing worth checking on any site.

In total: 2 critical, 3 high, 4 medium, 11 low and 1 informational item. Nothing
suggests the site has been attacked, and no passwords or keys were found in the
code it sends to visitors.

2 critical · 3 high · 4 medium · 11 low · 1 info

## What we measured

_no performance data collected_

## What is working well

- The site is served over HTTPS.
- No credentials were found in the JavaScript served to visitors.
- Every page tested is set up to display properly on phones.
- A robots.txt is published, and it lets search engines in rather than shutting them out.
- A complete sitemap is declared in robots.txt, listing all 33 pages.

## Findings

### This page tells search engines not to list it  
`[Critical · Quick fix]`

**What we found.**
```
<meta name="robots" content="noindex, follow">
    on https://badseo.dev/index/noindex-meta
```

**Why it matters.** This single tag removes the page from Google entirely — it will not appear for any search, including the business’s own name. It is most often left behind from a staging site or a site that was deliberately hidden before launch and never switched back.

**How to fix it.** Remove `noindex` from the robots meta tag on pages that should be found. Check the whole site, not just this page — the tag is usually applied in a shared layout or template.

### The server sends a header telling search engines not to list this page  
`[Critical · Quick fix]`

**What we found.**
```
X-Robots-Tag: noindex
    in the response to GET https://badseo.dev/index/noindex-header
```

**Why it matters.** Same effect as a noindex tag, and harder to spot because it is invisible in the page source. The page will not appear in search results.

**How to fix it.** Remove the `X-Robots-Tag: noindex` header from responses for public pages. It is set at the server, CDN or hosting-platform level rather than in the page itself.

### Plain HTTP is served without redirecting to HTTPS  
`[High · Quick fix]`

**What we found.**
```
http://badseo.dev ended at http://badseo.dev/ (HTTP 200) — still unencrypted.
```

**Why it matters.** Anyone typing the address, following an old link or on a shared network gets the site unencrypted, where the page and anything typed into it can be read and altered in transit.

**How to fix it.** Redirect all HTTP traffic to HTTPS with a 301 at the edge, and add HSTS so browsers stop trying HTTP at all.

### The page has no title  
`[High · Quick fix]`

**What we found.**
```
No <title> element in the head of https://badseo.dev/head/missing-title
```

**Why it matters.** The title is the blue clickable line in search results and the label on a browser tab. Without one, Google invents something from the page content — usually badly — and the page loses its single strongest ranking signal.

**How to fix it.** Add a `<title>` of roughly 50–60 characters that names the page and the business, most specific part first.

### Some addresses redirect in a circle  
`[High · Quick fix]`

**What we found.**
```
https://badseo.dev/redirect/loop
      302 → https://badseo.dev/redirect/loop
```

**Why it matters.** The browser gives up and shows an error, so the page is unreachable for visitors and cannot be indexed at all. Usually caused by two rules disagreeing about a trailing slash or about www.

**How to fix it.** Pick one canonical form — with or without the trailing slash, with or without www — and make every rule redirect towards it rather than between the two.

### HSTS is not set  
`[Medium · Quick fix]`

**What we found.**
```
Response headers for https://badseo.dev/ contain no `strict-transport-security`.
```

**Why it matters.** Without it, the first request of each session can be downgraded to unencrypted HTTP and read or modified in transit.

**How to fix it.** Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses.

### The page has no main heading  
`[Medium · Quick fix]`

**What we found.**
```
No <h1> found on https://badseo.dev/head/missing-h1. First heading is an <h2>: "Where the headline should be".
```

**Why it matters.** The main heading tells both a search engine and a screen-reader user what the page is about. Styling text to look like a heading is not the same thing — only the markup is read.

**How to fix it.** Mark the page’s main heading as `<h1>`. One per page.

### This page points search engines at a different address  
`[Medium · Quick fix]` _(unconfirmed)_

**What we found.**
```
Requested: https://badseo.dev/index/canonicalized
    <link rel="canonical" href="https://badseo.dev/">
```

**Why it matters.** Search engines will show the other address instead of this one, and any links earned by this page are credited there. Correct when the pages really are duplicates; a mistake when they are not.

**How to fix it.** Confirm the target is genuinely the same content. If it is not, point the canonical at this page’s own address.

### Several pages share the same title  
`[Medium · Moderate]`

**What we found.**
```
"Pumpkin Spice Latte Recipe" is the title of 2 pages:
    https://badseo.dev/content/duplicate-a
    https://badseo.dev/content/duplicate-b
```

**Why it matters.** Search engines use the title to tell pages apart. When several are identical they compete with each other for the same searches, and the one that wins is not necessarily the one you would choose.

**How to fix it.** Give each page a title naming what is specific to it — the product, the category, the location — before the business name.


## What we would do first

**This week** — the redirect from the unencrypted address to the secure one,
and the headers that belong with it. All of it is configuration at the hosting
layer, it is under an hour together, and it is the one group of findings here
that does not look deliberate.

**Next, if this site is ever meant to be found** — the two pages that tell
search engines not to list them, and the page with no title. On a fixture these
are the point. On a live site they are the difference between appearing in
search and not, and each is a one-line change.

**Later, and only if it matters** — the titles, descriptions, headings and
image alternatives in the hygiene appendix. All true, all worth doing on a real
site, none of it urgent. Here it is deliberate, so the honest recommendation is
to leave it exactly as it is.

**What we did not test.** Only the pages the site publishes in its own sitemap,
and only as an anonymous visitor — there is no login here. We did not measure
page speed. Two further limits come from where this audit ran rather than from
the site: the connection passed through an inspecting proxy, so the certificate
details the tools recorded were the proxy's rather than the site's and have been
removed from this report; and the deliberately orphaned page was reached only
because the sitemap names it — which is the point of that page, since nothing
links to it and following links would never find it.

## Appendix: hygiene

- **5 standard security header(s) are not set** `[Low]` — Set them once at the edge or in middleware so every response carries them: Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses. Start with a report-only policy to find what the site actually loads, then enforce a policy that names the script sources you trust. Send `X-Content-Type-Options: nosniff` on all responses. Send `X-Frame-Options: SAMEORIGIN`, or `frame-ancestors 'self'` in the Content-Security-Policy. Send `Referrer-Policy: strict-origin-when-cross-origin`.
- **Links to this site look plain when shared** `[Low]` — Add `og:title`, `og:description` and an `og:image` of about 1200×630 to the shared layout, defaulting to the business logo where a page has no image of its own.
- **The page title is cut off in search results** `[Low]` — Shorten to under 60 characters, putting the words that distinguish this page first and the business name last.
- **The page title is very short** `[Low]` — Expand to roughly 50–60 characters describing what the page offers.
- **The page has no description for search results** `[Low]` — Add a `<meta name="description">` of 50–160 characters describing the page as a sentence a customer would read.
- **The search-result description is cut off** `[Low]` — Trim to under 160 characters.
- **The page has several main headings** `[Low]` — Keep one `<h1>` and demote the rest to `<h2>`.
- **Heading levels skip a step** `[Low]` — Choose heading levels by position in the outline, not by how large you want the text to look. Set size with CSS.
- **Some links pass through several redirects** `[Low]` — Update the links to point at the final address, and collapse the server rules so one redirect reaches the destination.
- **Some images have no text alternative** `[Low]` — Add `alt` text describing what the image shows. For decorative images, add `alt=""` explicitly so assistive technology knows to skip them.
- **Several pages share the same search-result description** `[Low]` — Write a description per page, or generate one from the page’s own content.
- **A page has very little text** `[Info]` — If this page is meant to bring in search traffic, expand it to answer the questions a customer would actually ask. If it is not, no action needed.

## Appendix: how to reproduce these figures

```
node check-headers.mjs https://badseo.dev/ https://badseo.dev/kitchen-sink https://badseo.dev/index/noindex-header
node check-seo.mjs https://badseo.dev/ https://badseo.dev/privacy https://badseo.dev/head/missing-title https://badseo.dev/head/title-too-long https://badseo.dev/head/title-too-short https://badseo.dev/head/missing-meta-description https://badseo.dev/head/meta-description-too-long https://badseo.dev/head/meta-description-too-short https://badseo.dev/head/missing-h1 https://badseo.dev/head/empty-h1 https://badseo.dev/head/multiple-h1 https://badseo.dev/head/heading-order-skip https://badseo.dev/content/thin-content https://badseo.dev/content/images-missing-alt https://badseo.dev/content/duplicate-a https://badseo.dev/content/duplicate-b https://badseo.dev/content/duplicate-title-a https://badseo.dev/content/duplicate-title-b https://badseo.dev/content/duplicate-meta-a https://badseo.dev/content/duplicate-meta-b https://badseo.dev/index/noindex-meta https://badseo.dev/index/noindex-header https://badseo.dev/index/canonicalized https://badseo.dev/index/canonical-conflict https://badseo.dev/status/not-found https://badseo.dev/status/server-error https://badseo.dev/status/blocked https://badseo.dev/links/broken-internal-link https://badseo.dev/redirect/trailing-slash https://badseo.dev/perf/slow-response https://badseo.dev/structure/orphan https://badseo.dev/structure/no-outgoing-links https://badseo.dev/kitchen-sink
```
