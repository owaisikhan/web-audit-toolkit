# Website audit toolkit

Everything needed to audit somebody's website for speed, Core Web Vitals,
technical SEO, passive security exposure and (when I have the repo)
source-level risk, then turn it into a report a non-technical owner can act on.

The whole toolkit is the skill in `.claude/skills/web-audit/`. Open a Claude
Code session in this repo, say "audit https://theirsite.com", and the skill
loads itself. **Read `.claude/skills/web-audit/SKILL.md` first.** It is the
method (scope, triage by consequence, prove every claim, price every fix).
This README is the operating manual around it: what runs, what it writes,
where the output goes.

The scripts need Node and a Playwright Chromium. They find the browser
themselves, whether that is a local `node_modules`, a global install, or
`PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers` in a Claude Code sandbox).
**Do not run `playwright install`** in an environment that already ships one.
There is no `package.json` here and none is needed.

`RUNBOOK.md` is the step-by-step for auditing a new site end to end.

## Known environment issue: Chromium and TLS 1.3 in a Claude Code web session

Hit on 10 Sep 2026 and worth twenty minutes to anyone who meets it cold.

**Symptom.** Every page load fails with `net::ERR_CONNECTION_RESET`, on every
external host, while `curl` to the same host through the same proxy returns
200. `collect-perf.mjs` reports it as a finding per page:

```
[high] Page could not be loaded (mobile profile)
        page.goto: net::ERR_CONNECTION_RESET at https://example.com/
```

**Cause.** Outbound HTTPS in a Claude Code web session goes through an
intercepting agent proxy. It cannot complete Chromium's TLS 1.3 handshake:
the ClientHello (~1.7 kB, enlarged by the post-quantum key share) goes out,
39 bytes come back, and the tunnel closes after 6s. `curl` negotiates
differently and is unaffected, which is what makes this confusing: the host
is plainly reachable. Check `curl -sS "$HTTPS_PROXY/__agentproxy/status"` and
look for `ws_closed_mid_exchange` against your target host.

**Fix.** Cap the browser at TLS 1.2. The scripts hardcode their launch args,
so rather than editing them, put a wrapper where `findChromium()` looks. It
scans `$PLAYWRIGHT_BROWSERS_PATH` for `chromium*/chrome-linux/chrome`:

```bash
mkdir -p /tmp/pw-shim/chromium/chrome-linux
cat > /tmp/pw-shim/chromium/chrome-linux/chrome <<'EOF'
#!/bin/bash
exec /opt/pw-browsers/chromium-1194/chrome-linux/chrome --ssl-version-max=tls1.2 "$@"
EOF
chmod +x /tmp/pw-shim/chromium/chrome-linux/chrome

PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-shim node $SKILL/scripts/collect-perf.mjs ...
```

Check the real Chromium's version directory first. `chromium-1194` is what
that sandbox shipped, not a constant. This changes nothing about certificate
verification.

**Two things this environment makes untrue, even once loads succeed.** Both
are the auditor's problem, not the script's:

- **The TLS certificate in `security.json` is the proxy's, not the site's.**
  Look at `pages[].tls.issuer`. If it does not name a real CA, discard every
  certificate and expiry finding rather than reporting it. The report
  generator's "certificate is valid for another N days" line has to come out
  by hand.
- **Timings are measured from the sandbox's data centre**, which may sit next
  to the target's CDN edge (`x-vercel-id: iad1`, `x-vercel-cache: HIT` is the
  tell). Page-to-page comparison stays sound; the absolute LCP and TTFB
  flatter the site. Say so in the report's limits section.
- **TBT is unreliable in absolute terms here, and it errs the other way.**
  Total Blocking Time measures main-thread work, so it tracks the CPU this
  container was given rather than the visitor's phone. The same site measured
  three days apart went from 136–155 ms to 250–290 ms on every mobile page
  while serving byte-identical JavaScript, meaning the same script count, the
  same bytes and the same total transfer, with LCP and CLS flat. That produced
  four false `medium` findings. **Before reporting a TBT finding, compare
  `resourceSummary.byKind.script` against the previous run.** If the payload
  did not change, the machine did, and the finding is an artifact: drop it
  with `--drop perf-tbt-mobile` and say so in the triage notes.

If either matters to the deliverable, run the two live collectors from a
normal machine instead and generate the report from that JSON.

## The six scripts

One chooses which pages to spend time on, four collect, one writes up. Each
collector writes one JSON file into the output directory and prints a summary;
nothing interprets anything until the report step.

| Script | Run it on | Writes |
|---|---|---|
| `pick-pages.mjs` | a sitemap URL, or a list of URLs | `pages.json` (with `--out`) and a ranked table on stdout: status, server response time and transfer size per page, with anything much slower or heavier than that site's median flagged. Costs seconds where a browser run costs hours, so it decides which pages `collect-perf` is worth spending on. Passive only. |
| `collect-perf.mjs` | one or more live URLs | `perf.json`: LCP/CLS/TBT/TTFB/FCP per page per profile (median of N cold loads, Moto G-class 4G and/or desktop), request waterfall, transfer sizes, render-blocking assets, image and font waste, plus findings. Also `screenshots/` at phone and laptop width. |
| `check-headers.mjs` | one or more live URLs | `security.json`: response headers, cookie flags, TLS certificate, framework/version disclosure, exposed source maps, secrets found in the JavaScript the site itself serves, `robots.txt`/`sitemap.xml`/`security.txt`. Passive only. |
| `check-seo.mjs` | one or more live URLs | `seo.json`: indexability (`noindex` meta and header, `robots.txt`), canonicals including ones declared in the HTTP `Link` header, titles, descriptions, heading outline, viewport, `lang`, image alt text, Open Graph, HTTP status, thin and duplicate content, dead-end pages, orphan pages found by comparing the sitemap against the link graph, plus broken internal links and redirect chains. Passive only. |
| `scan-source.mjs` | a repo directory (only one I own or have been given) | `source.json`: dependency CVEs via `npm audit`, injection surface, unguarded endpoints, hard-coded secrets. Candidates, not verdicts: every hit needs reading in context. |
| `report.mjs` | the output directory | `report.html` (your worklist: evidence, measurements, reproduction commands), `report-client.html` (the one you send: same findings, no apparatus, prints to PDF cleanly) and `report.md`, built from whichever JSON files are present. It scaffolds. The summary and the plan come from `narrative.md` in the same directory, and are left as TODO markers if it is absent. |

`collect-perf.mjs` writes screenshots because a site can pass every metric and
still be unusable on a phone. Look at them.

## A full audit, end to end

```bash
SKILL=.claude/skills/web-audit
OUT=audits/bloomfield/2026-09-10          # client slug, then the date of the run

# 0. Which pages are worth a browser. Seconds, against hours for a full
#    perf run over a big site. Read its table, then edit the list it prints.
node $SKILL/scripts/pick-pages.mjs https://example.com/sitemap.xml --top 5 --out $OUT

# 1. Performance. More than one page, more than one run, because first loads are
#    noisy and --runs takes the median. The homepage is the most optimised
#    page on almost every site; the money is in the listing or the checkout.
node $SKILL/scripts/collect-perf.mjs \
  https://example.com https://example.com/shop https://example.com/shop/a-product \
  --out $OUT --runs 3 --all-profiles

# 2. Passive security posture.
node $SKILL/scripts/check-headers.mjs https://example.com https://example.com/shop --out $OUT

# 3. Technical SEO. Give it the SAME URL list as collect-perf: duplicate titles
#    and descriptions can only be found by comparing pages against each other.
node $SKILL/scripts/check-seo.mjs \
  https://example.com https://example.com/shop https://example.com/shop/a-product \
  --out $OUT

# 4. Source scan. ONLY with the repo in hand and permission to read it.
node $SKILL/scripts/scan-source.mjs /path/to/their-repo --out $OUT

# 5. Look at the screenshots, re-rank the findings by what they cost this
#    business, drop the ones I cannot demonstrate, write $OUT/narrative.md
#    (## Summary and ## Plan), then generate.
node $SKILL/scripts/report.mjs --out $OUT \
  --site "Bloomfield Garden Centre" --url https://example.com --by "Owais Khan"
```

That writes `report.html` (mine, with the evidence) and `report-client.html`
(theirs, print to PDF and send). `TRIAGE.md` beside them records what I dropped
and why, and never goes to the client.

Useful flags: `--runs N` (median of N cold loads), `--profile mobile|desktop`
or `--all-profiles`, `--timeout MS`, and `report.mjs --drop id1,id2` to remove
findings I decided were not real. Steps 3 and 4 of the list above are the ones
that take judgement. The generator does not know which findings I threw out,
and it leaves the summary and the plan blank for me to write.

## Passive only, and why

The scripts make the requests an ordinary visitor's browser makes, and draw
conclusions from the responses. They have no active mode and must not be given
one. Requesting paths nobody linked to, submitting to a form, sending any
payload, trying a login, or pointing a vulnerability scanner at a site is
active testing. It needs written permission naming the scope and the dates,
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

**Audit runs are committed to this repo, which means this repo must stay
private.** A run directory holds unfixed security findings about a live site,
described in enough detail to act on. Before adding a client, check the repo is
still private. Note that changing visibility later does not undo it: git
history keeps whatever was public while it was public. See `audits/README.md`
for the full convention, and `RUNBOOK.md` for how to produce a run.
