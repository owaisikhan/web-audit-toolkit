# CLAUDE.md

This repo is a website audit toolkit. The whole thing is the skill in
`.claude/skills/web-audit/`. Someone says "audit https://theirsite.com" and you
run four collectors, triage what comes back, and produce two reports.

**Read `.claude/skills/web-audit/SKILL.md` before doing anything else.** It is
the method, and the parts that matter are judgement rather than commands:
establish scope, collect before forming an opinion, rank by consequence to the
business rather than by what a scanner scored, prove every claim, and give
every finding a fix with an honest effort estimate.

## Ask this first, every time

> Whose site is this, and do we have permission to test it? Are we auditing the
> live site, a staging copy, or the source repository? Is there a login behind
> which most of the app lives?

| Situation | What may run |
|---|---|
| Public site, no permission | `collect-perf`, `check-headers`, `check-seo`. Passive only. |
| Written permission | The above, plus authenticated pages and `scan-source` on their repo. |
| Our own site and repo | Everything. |

Passive means requests an ordinary visitor's browser makes. Fuzzing, path
enumeration, injection payloads and vulnerability scanners are active testing
and are unlawful against a site you have not been authorised to test. The
scripts are passive by default. **Do not add an active mode to any of them.**

## The run

```bash
SKILL=.claude/skills/web-audit
OUT=audits/<client-slug>/$(date +%F)      # lowercase-hyphenated slug, run date

node $SKILL/scripts/pick-pages.mjs    <sitemap-url|URL...> --top 5   # which pages deserve a browser
node $SKILL/scripts/collect-perf.mjs  URL... --out $OUT --runs 3 --all-profiles
node $SKILL/scripts/check-headers.mjs URL... --out $OUT
node $SKILL/scripts/check-seo.mjs     URL... --out $OUT
node $SKILL/scripts/scan-source.mjs   /path/to/repo --out $OUT   # only with the repo
node $SKILL/scripts/report.mjs --out $OUT --site "Their Co" --url https://… [--drop id1,id2]
```

Audit more than the homepage. It is the most optimised page on almost every
site and the money is in the listing, the product page or the checkout. On a
site with more pages than you can measure, run `pick-pages.mjs` over the
sitemap first: a browser load costs 10 to 20 seconds and an HTTP probe costs
milliseconds, so it narrows the list on evidence in seconds. Give
`check-seo` the **same URL list** as `collect-perf`: duplicate titles and
descriptions can only be found by comparing pages against each other.

`RUNBOOK.md` is the step by step for a site you have not audited before.
`README.md` is the reference for what each script writes.

## Before the report goes anywhere

Write `$OUT/narrative.md` with `## Summary` and `## Plan` headings. Those two
sections cannot be generated, every report reads that one file, and a report
that ships with its TODO markers still in it is worse than no report.

`report.mjs` writes three files:

- `report.html` is yours. Evidence, measurements, reproduction commands.
- `report-client.html` is theirs. Same findings, no apparatus. Print to PDF.
- `report.md` mirrors `report.html`.

**If you re-run a collector after writing the narrative, re-check every number
in it.** The generated sections follow the JSON; the prose does not. Speed
figures move on every run even when the site has not changed, and severity
counts move with them. `RUNBOOK.md` §7 has the check.

Record what you dropped and why in `$OUT/TRIAGE.md`. **`TRIAGE.md` and the raw
JSON never go to the client.** Read the finished report end to end before it
leaves; the generator does not know which findings you decided were not real.

## This sandbox will lie to you in three specific ways

All three are documented with fixes in `README.md`. They cost hours if you meet
them cold.

1. **Chromium cannot complete a TLS 1.3 handshake through the agent proxy**, so
   every page load fails with `ERR_CONNECTION_RESET` while `curl` to the same
   host works. Put a TLS 1.2 shim where `findChromium()` looks and pass
   `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-shim`. See README, "Known environment issue".
2. **The TLS certificate in `security.json` is the proxy's, not the site's.**
   Check `pages[].tls.issuer`. If it does not name a real CA, drop every
   certificate and expiry finding, and delete the "certificate is valid for
   another N days" line from the report by hand.
3. **TBT inflates here** because it tracks this container's shared CPU rather
   than a visitor's phone. Before reporting one, compare
   `resourceSummary.byKind.script` against the previous run. Unchanged payload
   means the machine moved, not the site: drop it with `--drop perf-tbt-mobile`
   and say so in the triage notes.

## Repo conventions

- One directory per client, one dated directory per run:
  `audits/<client-slug>/<YYYY-MM-DD>/`. Never overwrite an old run to refresh
  it; a new date is a new directory. Two runs of the same site months apart is
  the most persuasive thing this toolkit produces.
- Audit runs **are** committed here on purpose. See `audits/README.md`, which
  also carries the condition that goes with it: a run directory describes
  unfixed weaknesses on somebody's live site, so check the repo's visibility
  before adding a client, and grep a run for credentials before committing it.
- No `package.json`, and none is needed. The scripts find Node and a Playwright
  Chromium themselves. **Never run `playwright install`** in an environment
  that already ships a browser.

## House style

**Never use an em dash to break a sentence.** This is the one that reads as
machine-written:

> The site is fast — faster than most shops we see — but nothing links to it.

Restructure instead of swapping the dash for a comma. A colon, a full stop, or
turning the fragment into a proper clause almost always reads better than the
dash did.

This is about the em dash (`—`) used mid-sentence, nothing else. En dashes in
number ranges (`136–155 ms`, `2010–2015`) are correct and stay. So do hyphens
in compound words, and arrows in a redirect chain.

Enforced today in `CLAUDE.md`, `README.md`, `RUNBOOK.md`, and every string in
`scripts/` that reaches a report. The reference docs under
`.claude/skills/web-audit/references/`, the script comments, and older
`TRIAGE.md` files predate the rule and still contain them. Clean them as you
touch them rather than in one sweep.

The rest applies to anything a client reads:

- Plain words. "The page takes six seconds to appear", not "LCP is degraded".
- No invented numbers. No revenue estimates, no conversion percentages
  borrowed from someone else's study. State what you measured.
- Never blame whoever built the site. They are often in the room and usually
  the person deciding whether you are hired.
- No finding without evidence you collected on that specific site.
