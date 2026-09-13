# Triage: badseo.dev, 13 September 2026

Passive only. No permission was sought or needed: `check-seo.mjs` and
`check-headers.mjs` make ordinary visitor requests, and badseo.dev is a public
site that publishes a `robots.txt` welcoming crawlers.

**This site is a deliberate test fixture.** Its sitemap lists 33 URLs, each
named for the single technical-SEO rule that page is built to break. It is not
a client. The run exists to exercise the collectors against known-bad input,
so the interesting output is not the finding list but which planted defects the
engine caught and which it walked past.

## Dropped from the report, and why

| Dropped | Grounds |
|---|---|
| "The HTTPS certificate is valid for another 30 days." | The recorded issuer is `Anthropic`, the sandbox's intercepting proxy, not the site's CA. `README.md` says to discard every certificate and expiry finding when this happens. Removed by hand from `report.html` and `report.md`; left intact in `security.json`, which is raw evidence. |
| "Page titles are present and sized to display fully in search results." | Contradicted by a finding in the same report (`seo-title-missing`, High). |
| "Pages carry their own search-result descriptions." | Contradicted by `seo-meta-description-missing`. |
| "Each page has exactly one main heading." | Contradicted by `seo-h1-missing` and `seo-h1-multiple`. |
| "Every image carries a text alternative." | Contradicted by `seo-images-missing-alt`. |

The last four are one bug, not four judgement calls. See below. Nothing was
dropped from the findings list: every finding in the report was reproduced and
is true of the page it names.

## Kept despite looking like noise

- **`seo-open-graph-missing`** fired on 33 of 33 pages. True everywhere, and a
  blanket miss is a legitimate single finding.
- **`seo-thin-content`** fired on 31 of 33. These are fixture pages of a few
  dozen words each. Correct, `info`, and flagged `unconfirmed` by the
  collector, which is the right handling.
- **`Plain HTTP is served without redirecting to HTTPS`** is the one finding
  here that does not look planted, since the fixture's taxonomy is entirely SEO.
  Verified independently: `curl -I http://badseo.dev/` returns `HTTP/1.1 200`
  with no redirect. Kept as High.

## Engine gaps this run exposed

Four planted defects produced no finding at all. These are collector bugs, not
triage decisions, and they are the actual product of this run:

1. **`META_MIN` is a dead constant.** `check-seo.mjs:30` defines it; `:269`
   uses it only inside a message string. No `desc.length < META_MIN` branch
   exists, so "description too short" can never fire.
   `/head/meta-description-too-short` serves 45 characters against a 50
   floor and was reported clean.
2. **Canonical conflicts declared in the HTTP `Link` header are invisible.**
   `/index/canonical-conflict` serves an HTML canonical of `?via=html` and a
   header canonical of `?via=header`. The collector reads only
   `link[rel=canonical]` from the DOM, never `page.headers['link']`. Compounded
   by `sameIsh`, which compares origin and pathname only, so the single HTML
   canonical looked like a self-reference.
3. **HTTP status is collected but never judged.** `collectPage` records
   `status` and it is written to `seo.json`, but no rule in `analysePage` reads
   it, only `loadError`. `/status/not-found` (404), `/status/server-error`
   (500) and `/status/blocked` (403) each produced nothing.
4. **No check exists** for orphan pages, pages with no outgoing links, or
   duplicate body content. `references/seo.md` documents orphan detection as
   out of scope; the other two are simply absent.

Plus one reporting bug, which is why four positives were dropped above:
**`positives` is gathered per page and unioned, while findings are per corpus.**
One page passing a check emits a site-wide claim that another page's failure
then contradicts in the same document.

And one characterisation worth knowing rather than fixing: **link-checking
results depend sharply on the input URL list.** Feeding all 33 sitemap URLs left
only 3 links to follow, because every other candidate was already an input and
therefore in `seen`. That run found the redirect loop and chain but missed the
broken internal link. Feeding only two pages found the broken link and missed
the loop.

## The perf half, added on the re-run

`collect-perf.mjs` was not run the first time, so this run adds it on four of
the 33 pages: the home page, `/kitchen-sink`, `/perf/slow-response` and
`/content/images-missing-alt`.

It caught the trap the fixture set. `/perf/slow-response` takes the server
**1.76 s** to begin replying, against **81 ms** on the home page, reported as
"Server is slow to respond". `/kitchen-sink` is the same, at 1.76 s, which the
sitemap does not advertise but the name implies. LCP follows the server: 2.62 s
on both slow pages against 1.05 s on the home page, so the slow start is the
whole of the difference rather than anything in the page itself.

Nothing was dropped. Every perf finding is true of the page it names, and two
of them are the fixture agreeing with its own labels.

This run is also the first badseo report with screenshots, since the thumbnails
the report embeds are written by `collect-perf` and there were none before.

## Method note

Chromium cannot complete a TLS 1.3 handshake through this sandbox's proxy, so
every collector ran behind the TLS 1.2 shim documented in `README.md`. TBT is
unreliable in this environment and was not used to rank anything here; see the
Saam's Store notes for the five-run evidence.
