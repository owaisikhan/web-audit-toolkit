# Saam's Store: triage notes, 2026-09-13

Live half only, passive. `collect-perf`, `check-headers` and `check-seo` against
the same four URLs as the 10 September run. `scan-source` was not re-run, as no
repo was in hand this session, so the two source findings from 10 September stand
unchanged and are not repeated here.

This run exists mainly to answer a question about the toolkit rather than the
site: `check-seo.mjs` landed on 13 September, so what can we see now that we
could not see three days ago?

## Dropped from the report, and why

| Dropped | Grounds |
|---|---|
| `perf-tbt-mobile` × 4, "Page freezes while scripts run", 244-283 ms | **Measurement artifact, not a site regression.** TBT roughly doubled against 10 September (155 to 244, 141 to 283, 142 to 252, 136 to 250) while the site served byte-identical JavaScript: same script count, same script bytes, same total transfer on all four pages. LCP, CLS and TTFB are flat across the same interval. Measured three times on 13 September it drifted within a 244-327 band against an identical payload every time (262/327/244, 290/274/283, 250/281/252, 263/272/250), which is noise rather than a trend. Dropped via `--drop perf-tbt-mobile`, per the rule now written into `README.md`. |
| "The HTTPS certificate is valid for another 30 days." | Recorded issuer is `Anthropic`, the sandbox's intercepting proxy, not the site's CA. `README.md` says to discard every certificate and expiry finding when this happens. |

The three contradictory positives this run originally produced, claiming every
page had a title, a description and one main heading while the findings said
otherwise, are gone at source. `check-seo.mjs` now computes positives across
the corpus as the absence of the matching failure, so they can no longer
contradict the findings beside them. Nothing had to be removed by hand this
time except the certificate line above, which is an environment artifact rather
than a logic error: on a machine without an intercepting proxy that positive is
true.

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

## Toolkit comparison: 10 Sep vs 13 Sep

**Better.**

- `check-seo.mjs` is new: 8 findings on this site that were previously
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

**Worse, briefly.** All three of these were found by this audit and fixed the
same day; they are recorded because the first pass of this run shipped with
them, and because the failure modes are worth recognising again.

- Merging positives across collectors in `report.mjs` was the right fix, since
  SEO positives had been silently dropped, but it surfaced a latent bug in
  `check-seo.mjs`, which gathered positives per page and unioned them while
  findings are per corpus. One passing page emitted a site-wide claim another
  page's failure contradicted. Fixed: positives are now computed across the
  corpus as the absence of the matching failure.
- `collect-perf.mjs` wrote its reproduction command as
  `--profile ${profiles.join(',')}`, producing `--profile mobile,desktop`,
  which the same script rejects as `unknown profile`. It was a command it could
  not run, printed in the report's "how to reproduce" appendix. The 10 September
  report has it hand-corrected to `--all-profiles`, so this had been hit before
  and patched at the symptom. Fixed at source; verified by feeding the recorded
  command back to the script.
- `README.md` warned that LCP and TTFB flatter the site when measured from this
  sandbox but said nothing about TBT, which errs the other way. Fixed: it now
  documents the inflation and the payload comparison that separates an artifact
  from a real regression.

## Re-run note

This directory was re-collected on the same day after `check-seo.mjs` and
`collect-perf.mjs` were fixed, so the archived run matches what the toolkit now
detects. The 10 September run is untouched, so the before/after across dates is
intact.

Two things changed as a result:

- **One new finding, `seo-meta-description-short`.** Every page's description
  is 34 characters against a 50-character floor. `META_MIN` had been a dead
  constant, so this could never previously fire. It is a true positive.
- **`perf.json` now records a reproduction command that runs.** It previously
  emitted `--profile mobile,desktop`, which the same script rejects as an
  unknown profile.

Nothing else moved: the security findings are unchanged for the third run
running, and the site's script payload is byte-identical to both earlier runs.

## Method note

Chromium cannot complete a TLS 1.3 handshake through this sandbox's proxy, so
all three collectors ran behind the TLS 1.2 shim documented in `README.md`.
