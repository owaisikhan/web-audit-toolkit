# Website audit toolkit

Everything needed to audit somebody's website — speed, Core Web Vitals,
passive security exposure, and (when I have the repo) source-level risk — and
turn it into a report a non-technical owner can act on.

The whole toolkit is the skill in `.claude/skills/web-audit/`. Open a Claude
Code session in this repo, say "audit https://theirsite.com", and the skill
loads itself. **Read `.claude/skills/web-audit/SKILL.md` first** — it is the
method (scope, triage by consequence, prove every claim, price every fix).
This README is the operating manual around it: what runs, what it writes,
where the output goes.

The scripts need Node and a Playwright Chromium. They find the browser
themselves — a local `node_modules`, a global install, or `PLAYWRIGHT_BROWSERS_PATH`
(`/opt/pw-browsers` in a Claude Code sandbox). **Do not run `playwright install`**
in an environment that already ships one. There is no `package.json` here and
none is needed.

## The four scripts

Three collect, one writes up. Each collector writes one JSON file into the
output directory and prints a summary; nothing interprets anything until the
report step.

| Script | Run it on | Writes |
|---|---|---|
| `collect-perf.mjs` | one or more live URLs | `perf.json` — LCP/CLS/TBT/TTFB/FCP per page per profile (median of N cold loads, Moto G-class 4G and/or desktop), request waterfall, transfer sizes, render-blocking assets, image and font waste, plus findings. Also `screenshots/` at phone and laptop width. |
| `check-headers.mjs` | one or more live URLs | `security.json` — response headers, cookie flags, TLS certificate, framework/version disclosure, exposed source maps, secrets found in the JavaScript the site itself serves, `robots.txt`/`sitemap.xml`/`security.txt`. Passive only. |
| `scan-source.mjs` | a repo directory (only one I own or have been given) | `source.json` — dependency CVEs via `npm audit`, injection surface, unguarded endpoints, hard-coded secrets. Candidates, not verdicts: every hit needs reading in context. |
| `report.mjs` | the output directory | `report.html` (self-contained, prints to PDF cleanly) and `report.md`, built from whichever JSON files are present. It scaffolds — the summary and the plan are left as TODO markers on purpose. |

`collect-perf.mjs` writes screenshots because a site can pass every metric and
still be unusable on a phone. Look at them.

## A full audit, end to end

```bash
SKILL=.claude/skills/web-audit
OUT=audits/bloomfield/2026-09-10          # client slug, then the date of the run

# 1. Performance. More than one page, more than one run — first loads are
#    noisy and --runs takes the median. The homepage is the most optimised
#    page on almost every site; the money is in the listing or the checkout.
node $SKILL/scripts/collect-perf.mjs \
  https://example.com https://example.com/shop https://example.com/shop/a-product \
  --out $OUT --runs 3 --all-profiles

# 2. Passive security posture.
node $SKILL/scripts/check-headers.mjs https://example.com https://example.com/shop --out $OUT

# 3. Source scan — ONLY with the repo in hand and permission to read it.
node $SKILL/scripts/scan-source.mjs /path/to/their-repo --out $OUT

# 4. Look at the screenshots, re-rank the findings by what they cost this
#    business, drop the ones I cannot demonstrate, then generate.
node $SKILL/scripts/report.mjs --out $OUT \
  --site "Bloomfield Garden Centre" --url https://example.com --by "Owais Khan"
```

Useful flags: `--runs N` (median of N cold loads), `--profile mobile|desktop`
or `--all-profiles`, `--timeout MS`, and `report.mjs --drop id1,id2` to remove
findings I decided were not real. Steps 3 and 4 of the list above are the ones
that take judgement — the generator does not know which findings I threw out,
and it leaves the summary and the plan blank for me to write.

## Passive only, and why

The scripts make the requests an ordinary visitor's browser makes, and draw
conclusions from the responses. They have no active mode and must not be given
one. Requesting paths nobody linked to, submitting to a form, sending any
payload, trying a login, or pointing a vulnerability scanner at a site is
active testing — it needs written permission naming the scope and the dates,
and without it it is a criminal offence in most jurisdictions regardless of
intent, including here.

The full statement of the line, what falls on each side, and how to write up
something serious found on a site I do not own, is in
`.claude/skills/web-audit/references/security.md`. Read it before the first
audit of anyone new. Passive findings alone are enough to win the work.

## Where audits live

One directory per client, one dated directory per run:

```
audits/<client-slug>/<YYYY-MM-DD>/
    perf.json
    security.json
    source.json          (only when I had the repo)
    screenshots/
    report.html
    report.md
```

Dated, so two audits of the same site months apart sit side by side. The
before/after is the most persuasive thing this toolkit produces and it costs
nothing to keep.

**`audits/` is gitignored, and stays that way.** This repo is public; an audit
directory holds unfixed security findings about somebody else's live site.
Keep the runs locally or somewhere private, and send the client their report
directly. See `audits/README.md`.
