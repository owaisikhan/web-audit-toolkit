#!/usr/bin/env node
// Turns the collectors' JSON into a client-ready report.
//
//   node report.mjs --out DIR --site "Example Ltd" [--url https://example.com]
//                   [--by "Your Name"] [--drop id1,id2]
//
// Writes <out>/report.html (self-contained, prints to PDF cleanly) and
// <out>/report.md. It scaffolds; it does not think. The summary, the plan and
// the judgement about which findings are real are left as TODO markers, and a
// report that goes out with those still in it is worse than no report.
// Read references/reporting.md before editing the output.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, SEVERITIES, bySeverityThenEffort, kb, ms } from './_lib.mjs';

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const EFFORT_LABEL = { quick: 'Quick fix', moderate: 'Moderate', involved: 'Involved' };
const TODO = (what) => `<!-- TODO: ${what} — see references/reporting.md. Do not send the report with this marker still in it. -->`;

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Escape, then turn `backticked spans` into real code. Findings are written
 * with Markdown-ish backticks so the same string serves report.md; left raw in
 * the HTML they show as literal backticks, which looks unfinished on the PDF a
 * client actually receives. Escaping happens first, so the span contents stay
 * escaped.
 */
function escInline(s = '') {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function load(outDir) {
  const parts = {};
  for (const name of ['perf', 'security', 'seo', 'source']) {
    const f = path.join(outDir, `${name}.json`);
    if (fs.existsSync(f)) parts[name] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  return parts;
}

function collectFindings(parts, drop) {
  const all = [];
  for (const p of Object.values(parts)) all.push(...(p.findings || []));
  return all.filter((f) => !drop.has(f.id)).sort(bySeverityThenEffort);
}

function metricsTable(parts) {
  const rows = [];
  for (const page of parts.perf?.pages || []) {
    for (const [profile, data] of Object.entries(page.profiles)) {
      if (!data.metrics) continue;
      const m = data.metrics;
      rows.push({
        url: page.url, profile,
        lcp: m.lcp, cls: m.cls, tbt: m.tbt, ttfb: m.ttfb, fcp: m.fcp,
        rating: m.rating,
        transfer: data.resourceSummary?.totalTransfer || 0,
        requests: data.resourceSummary?.totalRequests || 0,
      });
    }
  }
  return rows;
}

const CSS = `
:root {
  --ink: #14181f; --muted: #5b6472; --line: #e3e7ee; --bg: #ffffff; --panel: #f7f8fb;
  --critical: #a1122b; --high: #b4451a; --medium: #8a6410; --low: #3f5b7a; --info: #5b6472;
  --critical-bg: #fdeef1; --high-bg: #fdf1ea; --medium-bg: #fbf5e6; --low-bg: #eff3f8; --info-bg: #f2f4f7;
  --good: #1c6b45; --good-bg: #e9f5ee;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-text-size-adjust: 100%; }
.wrap { max-width: 46rem; margin: 0 auto; padding-block: 3rem 4rem; padding-left: 20px; padding-right: 20px; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .35rem; letter-spacing: -.02em; }
h2 { font-size: 1.3rem; margin: 3rem 0 1rem; padding-top: 1.2rem; border-top: 2px solid var(--ink); letter-spacing: -.01em; }
h3 { font-size: 1.05rem; margin: 0 0 .1rem; letter-spacing: -.005em; }
p { margin: 0 0 1rem; }
.lede { color: var(--muted); font-size: .95rem; margin-bottom: 2rem; }
.lede strong { color: var(--ink); }
.todo { background: #fff8e1; border: 1px dashed #b8860b; color: #6b4d00;
  padding: 1rem 1.1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: .9rem; }
.todo code { background: #0000000d; padding: .1em .35em; border-radius: 3px; }

.counts { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 2rem; padding: 0; list-style: none; }
.counts li { display: flex; align-items: baseline; gap: .45rem;
  border: 1px solid var(--line); border-radius: 999px; padding: .3rem .85rem; font-size: .85rem; }
.counts b { font-size: 1.05rem; }

.finding { border: 1px solid var(--line); border-radius: 10px; padding: 1.25rem 1.4rem;
  margin-bottom: 1.1rem; break-inside: avoid; }
.finding.critical { border-left: 5px solid var(--critical); }
.finding.high { border-left: 5px solid var(--high); }
.finding.medium { border-left: 5px solid var(--medium); }
.finding.low { border-left: 5px solid var(--low); }
.finding.info { border-left: 5px solid var(--info); }
.tags { display: flex; flex-wrap: wrap; gap: .4rem; margin: .55rem 0 1rem; }
.tag { font-size: .72rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
  padding: .2rem .55rem; border-radius: 4px; background: var(--info-bg); color: var(--info); }
.tag.critical { background: var(--critical-bg); color: var(--critical); }
.tag.high { background: var(--high-bg); color: var(--high); }
.tag.medium { background: var(--medium-bg); color: var(--medium); }
.tag.low { background: var(--low-bg); color: var(--low); }
.tag.plain { background: transparent; border: 1px solid var(--line); color: var(--muted); }
.finding h4 { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin: 1.1rem 0 .3rem; font-weight: 600; }
.finding h4:first-of-type { margin-top: 0; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 6px;
  padding: .8rem .9rem; overflow-x: auto; font: 12.5px/1.55 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  margin: 0 0 1rem; white-space: pre-wrap; word-break: break-word; }
code { font: .9em ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
p code { background: var(--panel); border: 1px solid var(--line); border-radius: 3px;
  padding: .05em .3em; word-break: break-word; }

.tablewrap { overflow-x: auto; margin-bottom: 1.5rem; }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: .55rem .7rem; border-bottom: 1px solid var(--line); }
th { font-size: .74rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rate { font-weight: 600; }
.rate.good { color: var(--good); }
.rate.needs-work { color: var(--medium); }
.rate.poor { color: var(--critical); }
.rate::before { content: "● "; font-size: .8em; }

.good-list { background: var(--good-bg); border-radius: 10px; padding: 1.1rem 1.4rem 1.1rem 2.6rem;
  margin-bottom: 1.5rem; }
.good-list li { margin-bottom: .35rem; }
.unconfirmed { background: var(--medium-bg); color: var(--medium); border-radius: 6px;
  padding: .55rem .8rem; font-size: .85rem; margin-bottom: 1rem; }
footer { margin-top: 3.5rem; padding-top: 1.2rem; border-top: 1px solid var(--line);
  color: var(--muted); font-size: .82rem; }

@media (max-width: 560px) {
  .wrap { padding-block: 2rem 3rem; }
  h1 { font-size: 1.5rem; }
}
@media print {
  .todo { display: none; }
  .wrap { max-width: none; padding: 0; }
  h2 { break-after: avoid; }
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ink: #e8ecf2; --muted: #98a2b3; --line: #2a3140; --bg: #12151b; --panel: #1a1f28;
    --critical: #ff8fa3; --high: #ffb083; --medium: #e8c46a; --low: #9fc0e0; --info: #98a2b3;
    --critical-bg: #2a1219; --high-bg: #2a1a10; --medium-bg: #2a2210; --low-bg: #16202b; --info-bg: #1a1f28;
    --good: #7fd6a6; --good-bg: #10231a;
  }
}
`;

function findingHtml(f) {
  return `
<article class="finding ${f.severity}">
  <h3>${esc(f.title)}</h3>
  <div class="tags">
    <span class="tag ${f.severity}">${SEV_LABEL[f.severity]}</span>
    <span class="tag plain">${EFFORT_LABEL[f.effort]}</span>
    <span class="tag plain">${esc(f.category)}</span>
  </div>
  ${f.unconfirmed ? '<p class="unconfirmed"><strong>Unconfirmed.</strong> This was identified from the outside and needs checking against the code or with access before it is treated as certain.</p>' : ''}
  <h4>What we found</h4>
  <pre>${esc(f.evidence)}</pre>
  <h4>Why it matters</h4>
  <p>${escInline(f.impact)}</p>
  <h4>How to fix it</h4>
  <p>${escInline(f.fix)}</p>
  ${f.url ? `<h4>Where</h4><p><code>${esc(f.url)}</code></p>` : ''}
</article>`;
}

function metricsHtml(rows) {
  if (!rows.length) return '';
  const cell = (v, rate, fmt) => `<td class="num"><span class="rate ${rate || ''}">${fmt(v)}</span></td>`;
  return `
<div class="tablewrap"><table>
<thead><tr><th>Page</th><th>Profile</th><th class="num">LCP</th><th class="num">CLS</th>
<th class="num">TBT</th><th class="num">TTFB</th><th class="num">Downloaded</th><th class="num">Requests</th></tr></thead>
<tbody>
${rows.map((r) => `<tr>
  <td>${esc(new URL(r.url).pathname || '/')}</td>
  <td>${esc(r.profile)}</td>
  ${cell(r.lcp, r.rating?.lcp, ms)}
  ${cell(r.cls, r.rating?.cls, (v) => v.toFixed(3))}
  ${cell(r.tbt, r.rating?.tbt, ms)}
  ${cell(r.ttfb, r.rating?.ttfb, ms)}
  <td class="num">${kb(r.transfer)}</td>
  <td class="num">${r.requests}</td>
</tr>`).join('\n')}
</tbody></table></div>
<p class="lede">LCP is when the main content finishes drawing, CLS is how much the page moves while loading,
TBT is how long it is frozen to taps, TTFB is the server's own response time.
Green is within Google's "good" range, amber needs work, red is poor.</p>`;
}

/* ------------------------------------------------------- the written parts */

/**
 * Read `<out>/narrative.md` — the two sections no generator can write: the
 * summary and the plan. Keeping them in one file means they are written once
 * and appear in every output, rather than being pasted into each by hand and
 * drifting apart. Absent, the reports carry their TODO markers as before.
 *
 *   ## Summary
 *   One paragraph per blank-line-separated block.
 *
 *   ## Plan
 *   **This week** — what and why.
 *   **Next** — what and why.
 */
function loadNarrative(outDir) {
  const file = path.join(outDir, 'narrative.md');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  // Split on `## ` headings rather than matching each section with a lookahead:
  // the last section has no following heading to anchor against, and JavaScript
  // has no \Z, so a lookahead approach silently drops it.
  const sections = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { current = h[1].toLowerCase(); sections.set(current, []); }
    else if (current) sections.get(current).push(line);
  }
  const section = (names) => {
    for (const n of names) {
      const body = sections.get(n.toLowerCase());
      if (body) return body.join('\n').trim();
    }
    return '';
  };
  const blocks = (s) => s.split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const summary = blocks(section(['Summary']));
  const plan = blocks(section(['Plan', 'What we would do first'])).map((b) => {
    const m = b.match(/^\*\*(.+?)\*\*\s*[—–-]?\s*([\s\S]*)$/);
    return m ? { head: m[1].trim(), body: m[2].trim() } : { head: '', body: b };
  });
  return (summary.length || plan.length) ? { summary, plan, raw: text } : null;
}

/** Escape, then honour the inline markdown the narrative and findings use. */
function rich(s = '') {
  return escInline(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/* ------------------------------------------------------ the client edition */

// Deliberately quieter than the technical report: more air, fewer rules and
// boxes, no severity vocabulary. An owner decides "do I pay for this", so the
// findings are banded by when you would do them rather than by what a scanner
// scored them.
const CLIENT_CSS = `
:root { --ink:#1a1a1a; --soft:#5b5b5b; --line:#e4e0d8; --paper:#fffdf9; --accent:#7a5c2e; --good:#2f6b41; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink);
  font:17px/1.65 Georgia, "Iowan Old Style", "Times New Roman", serif; }
.wrap { max-width: 40rem; margin:0 auto; padding: 3.5rem 1.5rem 5rem; }
h1 { font-size:2rem; line-height:1.2; margin:0 0 .4rem; letter-spacing:-.01em; }
.lede { color:var(--soft); font-size:.95rem; margin:0 0 3rem; }
h2 { font-size:1.35rem; margin:3.5rem 0 1rem; padding-bottom:.4rem; border-bottom:2px solid var(--accent); }
h3 { font-size:1.05rem; margin:2rem 0 .4rem; font-weight:600; }
p { margin:0 0 1rem; }
.big { font-size:1.15rem; line-height:1.6; }
.good li { margin-bottom:.5rem; color:var(--good); }
.good li span { color:var(--ink); }
ul { padding-left:1.2rem; }
.band { margin:2.5rem 0 0; }
.band-head { font:600 .8rem/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.09em;
  text-transform:uppercase; color:var(--accent); margin:0 0 .3rem; }
.band-note { color:var(--soft); font-size:.9rem; margin:0 0 1.2rem; }
.item { border-left:3px solid var(--line); padding:.1rem 0 .1rem 1.1rem; margin:0 0 1.8rem; }
.item h3 { margin-top:0; }
.item p { margin-bottom:.5rem; }
.effort { font:600 .75rem/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.05em;
  text-transform:uppercase; color:var(--soft); }
.fix { font-size:.95rem; color:var(--soft); }
.fix b { color:var(--ink); font-weight:600; }
code { font:.88em ui-monospace,Menlo,Consolas,monospace; background:#f2ede4;
  border-radius:3px; padding:.05em .3em; }
.plan p { margin-bottom:1.1rem; }
footer { margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--line);
  color:var(--soft); font-size:.9rem; }
@media print { body { background:#fff; } .wrap { padding:0; max-width:none; } h2 { break-after:avoid; } .item { break-inside:avoid; } }
@media (max-width:480px) { .wrap { padding:2rem 1rem 3rem; } h1 { font-size:1.6rem; } }
`;

const BANDS = [
  { key: 'now', sev: ['critical', 'high'], head: 'Worth fixing now',
    note: 'These cost you something today, whether that is visitors, search visibility or safety.' },
  { key: 'soon', sev: ['medium'], head: 'Worth fixing soon',
    note: 'Real problems, but none of them is an emergency. Sensible to bundle into the next piece of work.' },
  { key: 'minor', sev: ['low', 'info'], head: 'Minor, whenever you are next in there',
    note: 'True and worth doing, but nobody is losing a sale over them. Listed so the picture is complete.' },
];

function clientItem(f) {
  return `<div class="item">
  <h3>${rich(f.title)}</h3>
  <p>${rich(f.impact)}</p>
  <p class="fix"><b>What to change:</b> ${rich(f.fix)} <span class="effort">· ${esc(EFFORT_LABEL[f.effort] || f.effort)}</span></p>
</div>`;
}

/* -------------------------------------------------------------------- main */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out || path.join(process.cwd(), 'audit-out');
  const site = args.site || 'the site';
  const drop = new Set(String(args.drop || '').split(',').filter(Boolean));

  const parts = load(outDir);
  if (!Object.keys(parts).length) {
    console.error(`No collector output found in ${outDir}. Run the collectors first.`);
    process.exit(1);
  }

  const findings = collectFindings(parts, drop);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  const urls = [...new Set(Object.values(parts).flatMap((p) => p.urls || []))];
  // Every collector contributes to "what is working well", not just the
  // security one — a report that only praises the headers reads as grudging.
  const positives = [...new Set(Object.values(parts).flatMap((p) => p.positives || []))];
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = metricsTable(parts);
  const commands = Object.values(parts).map((p) => p.command).filter(Boolean);

  const main_ = findings.filter((f) => f.severity !== 'low' && f.severity !== 'info');
  const hygiene = findings.filter((f) => f.severity === 'low' || f.severity === 'info');

  const narrative = loadNarrative(outDir);
  const summaryHtml = narrative?.summary.length
    ? `<div>${narrative.summary.map((p) => `<p>${rich(p)}</p>`).join('')}</div>`
    : `<div class="todo">${TODO('Write the summary')}
<strong>Write four or five sentences here, in plain language, for a non-technical reader:</strong>
what was looked at, the single most important thing found, the counts below, and what to do first.
Answer the unasked question: say whether anything suggests the site has already been attacked.
No metric names, no tool names. Better still, write it once in <code>narrative.md</code> in this
directory under a <code>## Summary</code> heading, and every report picks it up.</div>`;
  const planHtml = narrative?.plan.length
    ? `<div class="plan">${narrative.plan.map((p) => `<p>${p.head ? `<b>${rich(p.head)}</b> ` : ''}${rich(p.body)}</p>`).join('')}</div>`
    : `<div class="todo">${TODO('Write the plan')}
<strong>Not a repeat of the list, but a sequence with reasoning.</strong>
Group into "this week", "next", and "later, if worth it", and say for each group why it is in that
order and roughly what it costs. This is the section that turns a report into an engagement.
Write it once in <code>narrative.md</code> under a <code>## Plan</code> heading.</div>`;

  const html = `<title>${esc(site)}: website audit</title>
<style>${CSS}</style>
<div class="wrap">
<h1>Website audit: ${esc(site)}</h1>
<p class="lede">${esc(date)}${args.by ? ` · prepared by ${esc(args.by)}` : ''}<br>
Pages tested: ${urls.map((u) => `<strong>${esc(u)}</strong>`).join(', ') || '—'}</p>

<h2>Summary</h2>
${summaryHtml}

<ul class="counts">
${SEVERITIES.filter((s) => counts[s]).map((s) => `<li><b>${counts[s]}</b> ${SEV_LABEL[s].toLowerCase()}</li>`).join('\n')}
</ul>

<h2>What we measured</h2>
<p>Pages were loaded in a real browser with an empty cache${parts.perf ? `, ${parts.perf.runs} times each, on a ${esc(parts.perf.pages?.[0]?.profiles?.mobile?.metrics?.profileLabel || 'throttled mobile')} profile; the figures below are medians` : ''}.
Security checks were <strong>passive</strong>: the site was loaded as an ordinary visitor's browser loads it, and the conclusions come from what the server sent back. Nothing was submitted, guessed or probed.</p>
${metricsHtml(rows)}

${positives.length ? `<h2>What is working well</h2>
<ul class="good-list">${positives.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}

<h2>Findings</h2>
${main_.length ? main_.map(findingHtml).join('\n') : '<p>Nothing above low severity was found.</p>'}

<h2>What we would do first</h2>
${planHtml}

${hygiene.length ? `<h2>Appendix: hygiene</h2>
<p class="lede">True, worth doing, not urgent. These are listed for completeness rather than because they need attention this month.</p>
${hygiene.map(findingHtml).join('\n')}` : ''}

<h2>Appendix: how to reproduce these figures</h2>
<p>Every number in this report came from these commands, run on ${esc(date)}. Re-running them will produce the same measurements, allowing for normal network variation.</p>
<pre>${esc(commands.join('\n'))}</pre>

<footer>
<p>Testing was limited to publicly reachable pages${parts.source ? ' plus a review of the source code provided' : ', without a login'}.
${parts.source ? '' : 'The signed-in part of the site was not tested, as we did not have access to it.'}
Sites change: this report describes ${esc(site)} as it was on ${esc(date)}.</p>
</footer>
</div>`;

  const md = `# Website audit: ${site}

${date}${args.by ? ` · prepared by ${args.by}` : ''}
Pages tested: ${urls.join(', ') || '—'}

## Summary

${TODO('Write the summary')}

${SEVERITIES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(' · ')}

## What we measured

${rows.map((r) => `- \`${r.url}\` (${r.profile}) — LCP ${ms(r.lcp)}, CLS ${r.cls.toFixed(3)}, TBT ${ms(r.tbt)}, TTFB ${ms(r.ttfb)}, ${kb(r.transfer)} over ${r.requests} requests`).join('\n') || '_no performance data collected_'}

${positives.length ? `## What is working well\n\n${positives.map((p) => `- ${p}`).join('\n')}\n` : ''}
## Findings

${(main_.length ? main_ : []).map((f) => `### ${f.title}  \n\`[${SEV_LABEL[f.severity]} · ${EFFORT_LABEL[f.effort]}]\`${f.unconfirmed ? ' _(unconfirmed)_' : ''}

**What we found.**
\`\`\`
${f.evidence}
\`\`\`

**Why it matters.** ${f.impact}

**How to fix it.** ${f.fix}
`).join('\n') || '_Nothing above low severity._'}

## What we would do first

${TODO('Write the plan')}

${hygiene.length ? `## Appendix: hygiene\n\n${hygiene.map((f) => `- **${f.title}** \`[${SEV_LABEL[f.severity]}]\` — ${f.fix}`).join('\n')}\n` : ''}
## Appendix: how to reproduce these figures

\`\`\`
${commands.join('\n')}
\`\`\`
`;

  fs.mkdirSync(outDir, { recursive: true });
  const bands = BANDS
    .map((b) => ({ ...b, items: findings.filter((f) => b.sev.includes(f.severity)) }))
    .filter((b) => b.items.length);

  const clientHtml = `<title>${esc(site)}: website review</title>
<style>${CLIENT_CSS}</style>
<div class="wrap">
<h1>${esc(site)}</h1>
<p class="lede">Website review, ${esc(date)}${args.by ? `, by ${esc(args.by)}` : ''}<br>
${urls.length} page${urls.length === 1 ? '' : 's'} checked</p>

<h2>The short version</h2>
${narrative?.summary.length ? `<div class="big">${narrative.summary.map((p) => `<p>${rich(p)}</p>`).join('')}</div>`
  : `<p class="big"><em>Write the summary in <code>narrative.md</code> before sending this to anyone.</em></p>`}

${positives.length ? `<h2>What is already working</h2>
<ul class="good">${positives.map((p) => `<li><span>${rich(p)}</span></li>`).join('')}</ul>` : ''}

${narrative?.plan.length ? `<h2>What we would do, in order</h2>
<div class="plan">${narrative.plan.map((p) => `<p>${p.head ? `<b>${rich(p.head)}</b> ` : ''}${rich(p.body)}</p>`).join('')}</div>` : ''}

<h2>Everything we found</h2>
${bands.map((b) => `<section class="band">
  <p class="band-head">${esc(b.head)}</p>
  <p class="band-note">${esc(b.note)}</p>
  ${b.items.map(clientItem).join('\n')}
</section>`).join('\n')}

<footer>
<p>Every point above was measured on ${esc(date)}, not assumed. The working notes behind each
one, including the exact measurements and the commands that produced them, are in the technical
version of this report and are available on request.</p>
<p>Testing covered publicly reachable pages${parts.source ? ' plus a review of the source code provided' : ' only, without signing in'}.
Websites change, so this describes ${esc(site)} as it was on ${esc(date)}.</p>
</footer>
</div>`;

  fs.writeFileSync(path.join(outDir, 'report.html'), html);
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  fs.writeFileSync(path.join(outDir, 'report-client.html'), clientHtml);
  console.log(`Wrote ${path.join(outDir, 'report.html')}, report.md and report-client.html`);
  console.log(`${findings.length} finding(s): ${SEVERITIES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ') || 'none'}`);
  console.log('\n  report.html         your worklist: evidence, measurements, reproduction commands');
  console.log('  report-client.html  the one you send: same findings, no apparatus');
  if (!narrative) {
    console.log('\nNo narrative.md found, so the summary and the plan are still TODO.');
    console.log(`Write them once in ${path.join(outDir, 'narrative.md')} under "## Summary" and "## Plan"`);
    console.log('headings, re-run this, and both reports pick them up. See references/reporting.md.');
  } else {
    if (!narrative.summary.length) console.log('\nnarrative.md has no "## Summary" section. Both reports are missing it.');
    if (!narrative.plan.length) console.log('narrative.md has no "## Plan" section. Both reports are missing it.');
  }
}

main();
