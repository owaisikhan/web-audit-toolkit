---
name: web-audit
description: Audit a live website or a web app's source for speed, Core Web Vitals, security exposure and code-level risk, then turn the findings into a report a non-technical site owner can act on — a pitch document when you are trying to win the work, or a before/after when you are fixing it. Covers measuring load performance with a real browser (LCP, CLS, TBT, waterfall, transfer sizes, render-blocking assets, image and font waste), passive security checks that are safe to run against a site you do not own (security headers, cookie flags, TLS, framework and version leakage, exposed source maps and secrets in client bundles), source-level review when you have the repo (dependency CVEs, auth guards, injection surface, secrets), triaging what is found by business impact rather than tool score, and writing it up. Use whenever someone asks to audit, scan, benchmark, speed up, optimise, harden, pen-test or "check" a website or web app, asks why a site is slow, wants a Lighthouse-style or PageSpeed report, wants to find vulnerabilities or security holes, or wants a report to send a client or prospect. Works on any stack; has extra depth for Next.js and Supabase.
---

# Auditing someone else's website

The output of this work is not a score. It is a decision by a person who owns
a website — usually someone who does not write code — about whether to spend
money fixing something. Everything below is in service of that: measure what
is real, only report what you can prove, and say what it costs them in terms
they already care about.

Two audiences, one method:

- **A prospect.** You are auditing to win work. The report has to be
  convincing without being alarmist, and specific enough that they believe you
  found it rather than generated it.
- **A site you already work on.** Same measurements, but the report becomes a
  worklist and a before/after.

| Doing this | Read |
|---|---|
| Measuring speed, Core Web Vitals, bundle and asset waste | `references/performance.md` |
| Security checks, and what is legal to run on whose site | `references/security.md` |
| Writing the deliverable | `references/reporting.md` |

---

## 0. Establish scope and permission before you touch anything

**Ask this first, every time, and do not skip it because the site is public.**

> Whose site is this, and do we have permission to test it? Are we auditing
> the live site, a staging copy, or the source repository? Is there a login
> behind which most of the app lives?

The answer sets a hard boundary that the rest of this skill obeys:

| Situation | What you may run |
|---|---|
| **Any public site, no permission** | Passive only. Load pages as a normal browser does, read what the server volunteers. Nothing else. |
| **Written permission from the owner** | Adds authenticated crawling, form and rate-limit probing, dependency scanning against their repo. |
| **Our own site / our own repo** | Everything, including source review and destructive-adjacent tests on a staging copy. |

**Passive means: you make ordinary requests that any visitor's browser would
make, and you draw conclusions from the responses.** It does not mean "slow
enough not to be noticed". Fuzzing inputs, enumerating paths, testing
injection payloads, brute-forcing logins and vulnerability scanners are all
active testing, and running them against a site you have not been authorised
to test is unlawful in most jurisdictions regardless of intent. `scripts/`
in this skill are passive by default and refuse to do otherwise without an
explicit flag — see `references/security.md` for that boundary in detail.

You can win the work with passive findings alone. Almost every site has real,
provable problems visible from the outside.

---

## 1. Collect, before you form an opinion

Run the collectors. They write raw JSON into an output directory; nothing
interprets anything yet.

```bash
SKILL=.claude/skills/web-audit
OUT=/tmp/audit/example.com

# Performance: real Chromium, cold cache, mobile and desktop profiles
node $SKILL/scripts/collect-perf.mjs https://example.com --out $OUT

# Passive security posture: headers, cookies, TLS, tech and version leakage
node $SKILL/scripts/check-headers.mjs https://example.com --out $OUT

# Only when you have the repository:
node $SKILL/scripts/scan-source.mjs /path/to/repo --out $OUT
```

Each writes `<out>/<name>.json` and prints a short summary. `collect-perf`
also writes screenshots at a laptop and a phone width — **look at them**. A
site can pass every metric and still be unusable on a phone, and that is a
finding you can only make with your eyes.

Run the performance collector **more than once**. First loads are noisy;
`--runs 3` takes the median. A single run that happened to hit a cold CDN
edge is not evidence, and you will be asked to reproduce it.

### Audit more than the homepage

The homepage is the most optimised page on almost every site. The money is
usually elsewhere: a product listing, a search results page, a dashboard, a
checkout. Pass several:

```bash
node $SKILL/scripts/collect-perf.mjs https://example.com https://example.com/shop \
  https://example.com/shop/some-product --out $OUT --runs 3
```

---

## 2. Triage by consequence, not by score

The collectors emit findings with a provisional severity. **Re-rank them
yourself.** A tool ranks by rule; you rank by what it does to this business.

Ask of every finding, in order:

1. **Can a stranger use this to cause harm?** Then it is critical, whatever
   the scanner said. An exposed key, a missing auth check, a leaked source
   map that reveals internal endpoints.
2. **Does it cost them customers today?** A 6-second LCP on the page people
   land on from ads is worth more than a missing header, however loudly a
   header scanner complains.
3. **Would fixing it take an afternoon?** Quick and visible beats large and
   invisible, when you are trying to be believed.
4. **Is it actually true on this site?** See below.

**Discard anything you cannot demonstrate.** A missing `Content-Security-Policy`
on a site with no user input and no third-party scripts is a footnote, not a
vulnerability, and reporting it as one is how you lose credibility with the one
technical person the owner will forward your report to. That person exists.
Write for them.

Severities in this skill mean:

| | |
|---|---|
| **Critical** | Exploitable now, by anyone, with consequence — data exposure, account takeover, money. |
| **High** | Real harm, but needs a condition: a logged-in victim, a specific browser, a chained step. Or: the site is unusably slow on the device most visitors use. |
| **Medium** | Degrades security or speed measurably. Would be a bug in review. |
| **Low** | Hardening and hygiene. True, worth doing, not urgent. |
| **Info** | Observation with no direct harm. Version disclosure, minor waste. |

---

## 3. Prove every claim

Each finding in the report carries evidence you actually collected:

- A number with its unit and how it was measured (`LCP 5.9 s, median of 3
  cold loads, Moto G4 profile, 4G throttling`) — never a bare "slow".
- The request or response that shows it (`Set-Cookie: session=…` with no
  `HttpOnly`), quoted, trimmed to the relevant line.
- A screenshot when the problem is visual.
- A file and line when you have the repo.

If you find yourself writing a finding whose evidence is "commonly a problem
in Next.js apps", delete it. Generic findings are what make an audit look
generated, and the owner has usually seen three of those already this month.

---

## 4. Give every finding a fix, and be honest about effort

A finding without a fix is a complaint. For each one, say what to change,
concretely enough that a competent developer could do it, and estimate:

| | |
|---|---|
| **Quick** | Under a day. Config, headers, an image format, a lazy import. |
| **Moderate** | A few days. Refactor a route, restructure queries, add caching. |
| **Involved** | A week or more, or it changes architecture. Say so plainly. |

Being straight about the involved ones is what makes the quick ones credible.

---

## 5. Generate the report

```bash
node $SKILL/scripts/report.mjs --out $OUT --site "Example Ltd" --url https://example.com
```

It reads every JSON in the output directory and writes `report.html` (a
self-contained page you can send or print to PDF) and `report.md`. Read
`references/reporting.md` before you edit the generated text — the ordering,
the tone, and what to leave out are the point of that file, and the generator
only gives you a scaffold.

**Always read the generated report end to end before it goes anywhere.** You
are putting your name on it, and the generator does not know which of the
findings you decided in step 2 were not real.

---

## Moving this skill to another repository

Nothing here is specific to the repository it currently lives in. The whole
directory is self-contained: copy `.claude/skills/web-audit/` anywhere and it
works, including into a repo that has no `package.json` of its own.

The only external requirement is Playwright and a Chromium. The scripts find
both wherever they are — a local `node_modules`, a global install, or the
`PLAYWRIGHT_BROWSERS_PATH` a sandbox sets. **Do not run `playwright install`
in an environment that already ships a browser**; check the browsers directory
first.

When it does move, the audits themselves should live with it — one directory
per client, keeping each `perf.json`, `security.json` and report. Two audits of
the same site three months apart is the most useful thing you can hand
somebody, and it costs nothing to keep.

---

## What this skill will not do

- **Run active tests against a site without permission.** Covered above; it
  is the one rule with no exception.
- **Report a finding you have not verified on this specific site.**
- **Score theatre.** "Your score is 34/100" invites arguing about the score.
  Lead with what a visitor experiences and what it costs.
- **Fix while auditing.** Collect everything first. Fixing as you go loses the
  before-state, which is the only thing that proves the after-state was worth
  paying for.
