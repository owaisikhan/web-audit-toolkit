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

function load(outDir) {
  const parts = {};
  for (const name of ['perf', 'security', 'source']) {
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
  <p>${esc(f.impact)}</p>
  <h4>How to fix it</h4>
  <p>${esc(f.fix)}</p>
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
  const urls = [...new Set([...(parts.perf?.urls || []), ...(parts.security?.urls || [])])];
  const positives = parts.security?.positives || [];
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows = metricsTable(parts);
  const commands = Object.values(parts).map((p) => p.command).filter(Boolean);

  const main_ = findings.filter((f) => f.severity !== 'low' && f.severity !== 'info');
  const hygiene = findings.filter((f) => f.severity === 'low' || f.severity === 'info');

  const html = `<title>${esc(site)} — website audit</title>
<style>${CSS}</style>
<div class="wrap">
<h1>Website audit: ${esc(site)}</h1>
<p class="lede">${esc(date)}${args.by ? ` · prepared by ${esc(args.by)}` : ''}<br>
Pages tested: ${urls.map((u) => `<strong>${esc(u)}</strong>`).join(', ') || '—'}</p>

<h2>Summary</h2>
<div class="todo">${TODO('Write the summary')}
<strong>Write four or five sentences here, in plain language, for a non-technical reader:</strong>
what was looked at, the single most important thing found, the counts below, and what to do first.
Answer the unasked question — say whether anything suggests the site has already been attacked.
No metric names, no tool names. Then delete this box.</div>

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
<div class="todo">${TODO('Write the plan')}
<strong>Not a repeat of the list — a sequence, with reasoning.</strong>
Group into "this week", "next", and "later, if worth it", and say for each group why it is in that
order and roughly what it costs. This is the section that turns a report into an engagement. Then delete this box.</div>

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
  fs.writeFileSync(path.join(outDir, 'report.html'), html);
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  console.log(`Wrote ${path.join(outDir, 'report.html')} and report.md`);
  console.log(`${findings.length} finding(s): ${SEVERITIES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ') || 'none'}`);
  console.log('\nTwo sections are left as TODO on purpose — the summary and the plan.');
  console.log('Read references/reporting.md, write them, and read the whole report before it goes anywhere.');
}

main();
