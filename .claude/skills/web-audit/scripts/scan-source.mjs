#!/usr/bin/env node
// Source-level scan. Only for a repository you own or have been given.
//
//   node scan-source.mjs <repo-dir> --out DIR [--no-audit] [--guard requireRole]
//
// This finds candidates, not verdicts. Every hit here needs reading in
// context before it goes in a report: a dangerouslySetInnerHTML fed by a
// hard-coded constant is fine, and reporting it is noise that costs you the
// findings that are real. See references/security.md.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, writeJson, finding, summarise, bySeverityThenEffort } from './_lib.mjs';

// `.claude` is skipped because it holds tooling, not the website — and
// because this scanner's own pattern list otherwise matches itself.
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.turbo', '.vercel', 'vendor', '.claude']);

// Routes that are public by design. Excluded from the unguarded-endpoint
// finding, which would otherwise flag every login page ever written.
const PUBLIC_BY_DESIGN = /(^|\/)(login|signin|sign-in|register|signup|sign-up|forgot-password|reset-password|logout|auth\/callback)(\/|\.)|^app\/page\.|^app\/layout\.|^(src\/)?pages\/index\./;
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte|astro|php|py|rb|go|java|sql|env|json|ya?ml|toml)$/i;

const PATTERNS = [
  {
    id: 'src-sql-concat',
    re: /(?:query|execute|raw|sql)\s*\(\s*[`'"][^`'"]*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b[^`'"]*(?:\$\{|['"]\s*\+)/i,
    title: 'SQL appears to be built by joining strings',
    severity: 'high', category: 'security', effort: 'moderate',
    impact: 'Where any part of that string comes from a request, an attacker can change what the query does — read other people\'s rows, or delete them.',
    fix: 'Use parameterised queries or the query builder throughout. Never interpolate a value into SQL text, even one that "cannot" be user-controlled.',
  },
  {
    id: 'src-dangerous-html',
    re: /dangerouslySetInnerHTML|\bv-html\b|\.innerHTML\s*=/,
    title: 'HTML is injected into the page from a variable',
    severity: 'medium', category: 'security', effort: 'moderate',
    impact: 'If the value ever contains anything a user supplied, that content runs as script in the browser of whoever views the page — including an administrator.',
    fix: 'Render the value as text, or sanitise it with a maintained library (DOMPurify) at the point of insertion.',
    verify: 'Follow each value back to its source. A hard-coded constant or server-rendered markdown from a trusted author is fine and should not be reported.',
  },
  {
    id: 'src-eval',
    re: /\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/,
    title: 'Code is evaluated from a string',
    severity: 'medium', category: 'security', effort: 'moderate',
    impact: 'Anything that reaches this string is executed as code. It also forces the site to allow `unsafe-eval`, which weakens its Content-Security-Policy for every other page.',
    fix: 'Replace with a direct call or a lookup table.',
  },
  {
    id: 'src-shell-interpolation',
    re: /\b(exec|execSync|spawnSync)\s*\(\s*[`'"][^`'"]*\$\{/,
    title: 'A shell command is built from an interpolated value',
    severity: 'high', category: 'security', effort: 'moderate',
    impact: 'A value containing a semicolon or backtick runs a second command on the server with the application\'s privileges.',
    fix: 'Use `execFile` with an argument array so nothing passes through a shell.',
  },
  {
    id: 'src-path-traversal',
    re: /path\.(join|resolve)\s*\([^)]*\b(req|request|params|searchParams|query|body|formData)\b/,
    title: 'A filesystem path is built from request data',
    severity: 'high', category: 'security', effort: 'moderate',
    impact: 'A value containing `../` reaches outside the intended directory, which can read any file the server process can read — including configuration and credentials.',
    fix: 'Resolve the path, then verify it still starts with the intended directory before opening it. Prefer looking the file up by an id in the database over accepting a path at all.',
  },
  {
    id: 'src-service-role-client',
    re: /SUPABASE_SERVICE_ROLE|service_role/,
    title: 'The Supabase service-role key is referenced in the codebase',
    severity: 'high', category: 'security', effort: 'quick',
    impact: 'The service-role key bypasses row-level security completely. It is correct in a server-only module; anywhere it can reach a client bundle it is a total compromise of the database.',
    fix: 'Confirm every reference is in a file that never ships to the browser — no `"use client"` anywhere in its import chain, and the variable name must not begin with `NEXT_PUBLIC_`.',
    verify: 'Check which files these are. A server-only usage is correct and should be reported as fine, not as a finding.',
  },
  {
    id: 'src-public-env-secret',
    re: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN|API_KEY)/,
    title: 'A secret-sounding value is exposed to the browser by its name',
    severity: 'critical', category: 'security', effort: 'quick',
    impact: 'Anything named `NEXT_PUBLIC_*` is inlined into the JavaScript sent to every visitor. If this holds a real secret, it is already public and must be rotated.',
    fix: 'Rotate the value, then rename the variable without the `NEXT_PUBLIC_` prefix and read it only on the server.',
  },
  {
    id: 'src-http-url',
    re: /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[a-z0-9.-]+/i,
    title: 'A resource is loaded over unencrypted HTTP',
    severity: 'low', category: 'security', effort: 'quick',
    impact: 'The request can be read and modified in transit, and browsers will block it as mixed content on an HTTPS page.',
    fix: 'Change the URL to https.',
  },
  {
    id: 'src-todo-security',
    re: /(?:TODO|FIXME|HACK|XXX)[^\n]{0,80}(?:security|auth|permission|validat|sanitiz|escape|inject)/i,
    title: 'A note in the code flags unfinished security work',
    severity: 'info', category: 'security', effort: 'quick',
    impact: 'Someone knew about this and left it. These are worth reading first because they are usually accurate.',
    fix: 'Triage each one and either fix it or record the decision not to.',
  },
];

const SECRET_FILE_RE = /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|id_ed25519|\.pem|\.p12|credentials\.json|service-account.*\.json)$/i;
const SECRET_VALUE_RE = /\b(sk_live_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;

function walk(dir, base = dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, files);
    else if (e.isFile()) files.push({ full, rel: path.relative(base, full) });
  }
  return files;
}

function gitTracked(repo, rel) {
  try {
    execFileSync('git', ['-C', repo, 'ls-files', '--error-unmatch', rel], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function runNpmAudit(repo) {
  if (!fs.existsSync(path.join(repo, 'package.json'))) return null;
  try {
    const out = execFileSync('npm', ['audit', '--json'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000 });
    return JSON.parse(out);
  } catch (e) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    try { return JSON.parse(e.stdout || ''); } catch { return { error: String(e.message || e).slice(0, 200) }; }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(args._[0] || '.');
  if (!fs.existsSync(repo)) throw new Error(`no such directory: ${repo}`);
  const outDir = args.out || path.join(process.cwd(), 'audit-out');
  const guardName = args.guard || null;

  const files = walk(repo);
  const findings = [];
  const hits = {};
  const notes = [];

  // --- Committed secret files ----------------------------------------------
  const secretFiles = files.filter((f) => SECRET_FILE_RE.test(f.rel) && !/\.example$|\.sample$|\.template$/i.test(f.rel));
  const tracked = secretFiles.filter((f) => gitTracked(repo, f.rel));
  if (tracked.length) {
    findings.push(finding({
      id: 'src-committed-secret-file',
      title: `${tracked.length} file(s) that normally hold credentials are committed to the repository`,
      severity: 'critical', category: 'security', effort: 'quick',
      evidence: tracked.map((f) => f.rel).join('\n'),
      impact: 'Anyone with access to the repository, now or at any point in its history, has these credentials. Deleting the file does not remove it from the history.',
      fix: 'Rotate every credential in these files first. Then remove them from the working tree, add them to .gitignore, and purge them from the history if the repository is or ever was public.',
    }));
  }
  if (secretFiles.length && !tracked.length) {
    notes.push(`${secretFiles.length} local credential file(s) present but correctly untracked by git.`);
  }

  // --- Content patterns -----------------------------------------------------
  const valueHits = [];
  for (const f of files) {
    if (!CODE_EXT.test(f.rel)) continue;
    let text;
    try {
      const stat = fs.statSync(f.full);
      if (stat.size > 2 * 1024 * 1024) continue;
      text = fs.readFileSync(f.full, 'utf8');
    } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (SECRET_VALUE_RE.test(line)) {
        valueHits.push(`${f.rel}:${i + 1}  ${line.trim().slice(0, 60).replace(SECRET_VALUE_RE, (m) => `${m.slice(0, 10)}…`)}`);
      }
      for (const p of PATTERNS) {
        if (!p.re.test(line)) continue;
        (hits[p.id] ||= []).push(`${f.rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
      }
    }
  }

  if (valueHits.length) {
    findings.push(finding({
      id: 'src-secret-in-code',
      title: `A credential is written directly into ${valueHits.length} line(s) of source`,
      severity: 'critical', category: 'security', effort: 'quick',
      evidence: valueHits.slice(0, 8).join('\n'),
      impact: 'The value is in the repository and in its history, visible to everyone with access and permanently public if the repository ever was.',
      fix: 'Rotate the credential, move it to an environment variable read on the server, and purge it from the git history.',
    }));
  }

  for (const p of PATTERNS) {
    const h = hits[p.id];
    if (!h?.length) continue;
    findings.push(finding({
      id: p.id,
      title: `${p.title} (${h.length} place${h.length > 1 ? 's' : ''})`,
      severity: p.severity, category: p.category, effort: p.effort,
      evidence: h.slice(0, 8).join('\n') + (h.length > 8 ? `\n… and ${h.length - 8} more` : '') +
        (p.verify ? `\n\nBefore reporting: ${p.verify}` : ''),
      impact: p.impact, fix: p.fix,
      unconfirmed: Boolean(p.verify),
    }));
  }

  // --- Route / server-action guard inventory --------------------------------
  // Not a finding by itself: a list for you to read. The recurring high-value
  // bug is a route that checks that you are signed in but not whether you are
  // allowed — see references/security.md.
  const routeFiles = files.filter((f) => /(^|\/)(route|page|actions?)\.(js|ts|jsx|tsx)$/.test(f.rel) || /\/(api|pages\/api)\//.test(f.rel));
  const guardRe = guardName
    ? new RegExp(guardName)
    : /require(Role|Auth|User|PageRole)|getServerSession|auth\(\)|getUser\(\)|authorize|isAdmin|withAuth|ensureUser/;
  const routes = routeFiles.map((f) => {
    let text = '';
    try { text = fs.readFileSync(f.full, 'utf8'); } catch {}
    return {
      file: f.rel,
      guarded: guardRe.test(text),
      serverAction: /['"]use server['"]/.test(text),
      client: /['"]use client['"]/.test(text),
    };
  });
  const unguarded = routes.filter((r) =>
    !r.guarded && !r.client && !PUBLIC_BY_DESIGN.test(r.file) &&
    (r.serverAction || /\/(api|route)/.test(r.file)));
  if (unguarded.length) {
    findings.push(finding({
      id: 'src-unguarded-endpoints',
      title: `${unguarded.length} server endpoint(s) show no authorisation check`,
      severity: 'high', category: 'security', effort: 'moderate',
      unconfirmed: true,
      evidence: unguarded.slice(0, 12).map((r) => r.file).join('\n') +
        `\n\nSearched for: ${guardRe.source}` +
        '\nLogin, registration and root pages are excluded as public by design.' +
        '\nThis is a text search. Confirm each one by reading it — a guard applied in middleware or a shared wrapper will not match here.',
      impact: 'An endpoint that does not check who is calling can be called by anyone who knows the address. The common form of this bug is a route that confirms you are signed in but not that the record belongs to you, so changing an id in the URL returns another customer\'s data.',
      fix: 'For each endpoint, establish what stops one signed-in user reading or changing another\'s data. Enforce it on the server — in the database with row-level security where the database supports it — not by hiding the link in the interface.',
    }));
  }

  // --- Dependencies ---------------------------------------------------------
  let audit = null;
  if (!args['no-audit']) {
    process.stderr.write('  npm audit … ');
    audit = runNpmAudit(repo);
    process.stderr.write('done\n');
    const v = audit?.metadata?.vulnerabilities;
    if (v) {
      const prod = Object.values(audit.vulnerabilities || {}).filter((x) => !x.isDirect || true);
      const serious = (v.critical || 0) + (v.high || 0);
      if (serious) {
        const named = Object.values(audit.vulnerabilities || {})
          .filter((x) => ['critical', 'high'].includes(x.severity))
          .slice(0, 8)
          .map((x) => `${x.name} (${x.severity})${x.via?.[0]?.title ? ` — ${x.via[0].title}` : ''}`);
        findings.push(finding({
          id: 'src-dependency-vulns',
          title: `${serious} dependency advisor${serious > 1 ? 'ies' : 'y'} at high or critical severity`,
          severity: (v.critical || 0) ? 'high' : 'medium',
          category: 'security', effort: 'moderate',
          unconfirmed: true,
          evidence: named.join('\n') +
            `\n\nTotals: ${v.critical || 0} critical, ${v.high || 0} high, ${v.moderate || 0} moderate, ${v.low || 0} low across ${prod.length} package(s).` +
            '\nBefore reporting: separate production from development dependencies, and check whether the vulnerable code path is reachable from anything the site serves. An advisory in a build-only package is not a vulnerability in the website.',
          impact: 'Published vulnerabilities in libraries the site depends on are the easiest thing for an attacker to find, because the advisory tells them exactly what to look for.',
          fix: 'Run `npm audit fix` for the ones that resolve cleanly, upgrade the rest deliberately, and record a decision for any that cannot be upgraded yet.',
        }));
      }
    }
  }

  const summary = {
    tool: 'scan-source', collectedAt: new Date().toISOString(),
    command: `node scan-source.mjs ${repo}`,
    repo, filesScanned: files.length,
    routes, notes,
    audit: audit ? { metadata: audit.metadata, error: audit.error } : null,
    findings: findings.sort(bySeverityThenEffort),
  };
  const file = writeJson(outDir, 'source', summary);
  summarise('Source', summary.findings);
  console.log(`\n${routes.length} route/action file(s) inventoried, ${routes.filter((r) => r.guarded).length} with a visible guard.`);
  console.log(`Wrote ${file}`);
  console.log('Every hit above is a candidate. Read it in context before it goes in a report.');
}

main();
