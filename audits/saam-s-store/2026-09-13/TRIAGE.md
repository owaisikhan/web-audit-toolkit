# Saam's Store — triage notes, 2026-09-13

Live half only, passive. `collect-perf`, `check-headers` and `check-seo` against
the same four URLs as the 10 September run. `scan-source` was not re-run — no
repo in hand this session, so the two source findings from 10 September stand
unchanged and are not repeated here.

This run exists mainly to answer a question about the toolkit rather than the
site: `check-seo.mjs` landed on 13 September, so what can we see now that we
could not see three days ago?

## Dropped from the report, and why

| Dropped | Grounds |
|---|---|
| `perf-tbt-mobile` × 4 — "Page freezes while scripts run", 250–290 ms | **Measurement artifact, not a site regression.** TBT roughly doubled on every mobile page against 10 September (155→262, 141→290, 142→250, 136→263) while the site served byte-identical JavaScript: same script count, same script bytes, same total transfer on all four pages. LCP, CLS and TTFB are flat or improved over the same interval. Uniformly doubled main-thread blocking with an unchanged payload is this sandbox's shared CPU, not the shop. Dropped via `--drop perf-tbt-mobile`. |
| "The HTTPS certificate is valid for another 30 days." | Recorded issuer is `Anthropic` — the sandbox's intercepting proxy, not the site's CA. `README.md` says to discard every certificate and expiry finding when this happens. |
| "Each page has exactly one main heading." | Contradicted by `seo-h1-missing` in the same report: `/cart` has none. |
| "Page titles are present and sized to display fully in search results." | Contradicted by `seo-title-short`: the home page title is 11 characters. |
| "Pages carry their own search-result descriptions." | Reworded rather than dropped. Literally true that each page has one, but "their own" is contradicted by `seo-duplicate-meta` — three of four share an identical description. |

Nothing else was dropped. Every remaining finding was reproduced and is true of
the page it names.

## What the site actually looks like

Unchanged from 10 September on every axis the old run could measure. Security
findings are identical (1 low, 1 info). Perf payloads are byte-identical. The
site did not change; the toolkit did.

The genuinely new material is all SEO, and the commercially interesting part is
one finding: **the home page, `/products/apple` and `/cart` all carry the title
"Saamj Store" and the same description.** On a shop, a product page that is
indistinguishable from the cart is a real cost, and it is a template fix.

## Toolkit comparison — 10 Sep vs 13 Sep

**Better.**

- `check-seo.mjs` is new: 7 findings on this site that were previously
  invisible, including two mediums (duplicate titles across three pages, no
  `h1` on the cart).
- Internal link checking is new: 30 links followed, none broken, no redirect
  chains. That is a clean bill the toolkit could not previously issue.
- `report.mjs` renders backticked spans as `<code>`. The 10 September
  `report.html` carries 12 raw backticks in visible prose; this one carries
  none.
- `report.mjs` merges positives across all collectors instead of reading only
  `security`. On 10 September the generator could emit at most five thin
  security bullets, which is why that report's "What is working well" was
  hand-written prose.

**Worse.**

- The positives merge surfaced a latent bug in `check-seo.mjs`: positives are
  gathered per page and unioned, while findings are per corpus, so one passing
  page emits a site-wide claim another page's failure contradicts. Two such
  contradictions appeared here and had to be removed by hand. The merge is the
  correct change; the positives logic underneath it is wrong.

**Pre-existing, found by trying to reproduce the old run.**

- `collect-perf.mjs:516` writes its reproduction command as
  `--profile ${profiles.join(',')}`, producing `--profile mobile,desktop`,
  which line 481 then rejects as `unknown profile`. The collector emits a
  command it cannot run, and that string goes into the report's "how to
  reproduce" appendix. The 10 September report has it hand-corrected to
  `--all-profiles`, so this was hit before and patched at the symptom.
- `README.md` warns that LCP and TTFB flatter the site when measured from this
  sandbox. It should also warn that **TBT is unreliable in absolute terms**
  here, for the reason documented above — it inflates rather than flatters, and
  it produced four false mediums this run.

## Method note

Chromium cannot complete a TLS 1.3 handshake through this sandbox's proxy, so
all three collectors ran behind the TLS 1.2 shim documented in `README.md`.
