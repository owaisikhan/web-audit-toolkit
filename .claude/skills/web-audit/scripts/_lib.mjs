// Shared helpers for the web-audit collectors.
// No dependencies beyond Node builtins and (for the browser collector) the
// globally installed Playwright.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/** Parse `--flag value` and `--flag` pairs, returning { _: positionals, ...flags }. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

export function writeJson(outDir, name, data) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/**
 * Import Playwright from wherever it is: a local node_modules, or a global
 * install. ESM does not search global paths, so a globally installed
 * Playwright — which is what several sandboxes ship — has to be located and
 * imported by file URL. Keeps this skill runnable in a repo that has no
 * package.json of its own.
 */
export async function loadPlaywright() {
  // Playwright is CommonJS. Imported by file URL its named exports are not
  // always detected, so the browsers land on `.default` instead — normalise.
  const norm = (mod) => (mod?.chromium ? mod : mod?.default?.chromium ? mod.default : null);
  try {
    const m = norm(await import('playwright'));
    if (m) return m;
  } catch {}
  const roots = [];
  try {
    const { execFileSync } = await import('node:child_process');
    roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim());
  } catch {}
  roots.push('/usr/local/lib/node_modules', '/usr/lib/node_modules', '/opt/node22/lib/node_modules');
  for (const root of roots) {
    for (const pkg of ['playwright', 'playwright-core']) {
      const entry = path.join(root, pkg, 'index.js');
      if (fs.existsSync(entry)) {
        try {
          const m = norm(await import(url.pathToFileURL(entry).href));
          if (m) return m;
        } catch {}
      }
    }
  }
  throw new Error(
    'Could not find Playwright. Install it locally (`npm i -D playwright`) or globally (`npm i -g playwright`).\n' +
    'Do not run `playwright install` in a sandbox that already ships a browser — see SKILL.md.'
  );
}

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const EFFORTS = ['quick', 'moderate', 'involved'];

/**
 * Build a finding. Every field is required except `url` and `unconfirmed`,
 * because a finding missing its evidence or its fix is not reportable — see
 * SKILL.md §3 and §4.
 */
export function finding({
  id,
  title,
  severity,
  category,
  evidence,
  impact,
  fix,
  effort,
  url,
  unconfirmed = false,
}) {
  if (!SEVERITIES.includes(severity)) throw new Error(`bad severity: ${severity}`);
  if (!EFFORTS.includes(effort)) throw new Error(`bad effort: ${effort}`);
  for (const [k, v] of Object.entries({ id, title, evidence, impact, fix, category })) {
    if (!v || typeof v !== 'string') throw new Error(`finding ${id}: missing ${k}`);
  }
  return { id, title, severity, category, evidence, impact, fix, effort, url, unconfirmed };
}

export function bySeverityThenEffort(a, b) {
  const s = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  return s !== 0 ? s : EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort);
}

export function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} kB`;
}

export function ms(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

export function median(nums) {
  const s = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Locate the pre-installed Chromium. The versioned directory is what actually
 * resolves in this environment; the unversioned symlink is not reliable.
 */
export function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  const candidates = [];
  for (const entry of fs.readdirSync(root)) {
    if (!entry.startsWith('chromium')) continue;
    for (const rel of [
      'chrome-linux/chrome',
      'chrome-linux/headless_shell',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ]) {
      const p = path.join(root, entry, rel);
      if (fs.existsSync(p)) candidates.push(p);
    }
  }
  // Prefer full chromium over headless_shell: we take screenshots.
  candidates.sort((a, b) => (a.includes('headless_shell') ? 1 : 0) - (b.includes('headless_shell') ? 1 : 0));
  return candidates[0];
}

/** Refuse to run against anything that is not a plain public http(s) URL. */
export function assertPassiveTarget(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`Only http/https targets are supported: ${url}`);
  }
  return u;
}

export function summarise(name, findings) {
  const counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const line = SEVERITIES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ');
  console.log(`\n${name}: ${findings.length} finding(s)${line ? ` — ${line}` : ''}`);
  for (const f of [...findings].sort(bySeverityThenEffort)) {
    console.log(`  [${f.severity.padEnd(8)}] ${f.title}`);
  }
}
