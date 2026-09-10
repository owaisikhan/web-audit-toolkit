#!/usr/bin/env node
// Passive security posture check. Loads the page as a browser does and reads
// what the server volunteers: response headers, cookies, TLS certificate,
// technology disclosure, and the JavaScript the site itself serves.
//
//   node check-headers.mjs <url...> --out DIR [--timeout 30000]
//
// PASSIVE ONLY, BY DESIGN. It requests the URLs given, the assets those pages
// reference, and the three well-known files whose purpose is to be fetched
// (robots.txt, sitemap.xml, security.txt). It does not guess paths, submit
// forms, send payloads or attempt logins — those are active tests and need
// written authorisation. See references/security.md. Do not add an active
// mode to this script.

import path from 'node:path';
import tls from 'node:tls';
import {
  parseArgs, writeJson, finding, findChromium, assertPassiveTarget, loadPlaywright,
  summarise, bySeverityThenEffort,
} from './_lib.mjs';

const WELL_KNOWN = ['/robots.txt', '/sitemap.xml', '/.well-known/security.txt'];

const HEADER_CHECKS = [
  {
    key: 'strict-transport-security',
    name: 'HSTS',
    why: 'Without it, the first request of each session can be downgraded to unencrypted HTTP and read or modified in transit.',
    fix: 'Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses.',
    base: 'medium', withAuth: 'high',
  },
  {
    key: 'content-security-policy',
    name: 'Content-Security-Policy',
    why: 'There is no second line of defence if a cross-site scripting bug is ever introduced: any injected script runs with full access to the page.',
    fix: 'Start with a report-only policy to find what the site actually loads, then enforce a policy that names the script sources you trust.',
    base: 'low', withAuth: 'medium',
  },
  {
    key: 'x-content-type-options',
    name: 'X-Content-Type-Options',
    why: 'Browsers may guess a file is a different type than it was served as, which can turn an uploaded file into an executable script.',
    fix: 'Send `X-Content-Type-Options: nosniff` on all responses.',
    base: 'low', withAuth: 'low',
  },
  {
    key: 'x-frame-options',
    name: 'X-Frame-Options / frame-ancestors',
    alt: (h) => /frame-ancestors/i.test(h['content-security-policy'] || ''),
    why: 'The site can be loaded invisibly on top of an attacker\'s page so that a signed-in visitor\'s clicks land on it without them knowing.',
    fix: "Send `X-Frame-Options: SAMEORIGIN`, or `frame-ancestors 'self'` in the Content-Security-Policy.",
    base: 'low', withAuth: 'medium',
  },
  {
    key: 'referrer-policy',
    name: 'Referrer-Policy',
    why: 'Full URLs — including anything sensitive in the path or query string — are sent to every external site the page links to or loads a resource from.',
    fix: 'Send `Referrer-Policy: strict-origin-when-cross-origin`.',
    base: 'low', withAuth: 'low',
  },
];

// Key-shaped strings. Each carries whether a match is genuinely secret: several
// of these are public by design and reporting one as a leak is a credibility
// loss (references/security.md).
const SECRET_PATTERNS = [
  { re: /\bsk_live_[A-Za-z0-9]{16,}/g, name: 'Stripe live secret key', secret: true },
  { re: /\bsk_test_[A-Za-z0-9]{16,}/g, name: 'Stripe test secret key', secret: true },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, name: 'AWS access key id', secret: true },
  { re: /\bghp_[A-Za-z0-9]{30,}/g, name: 'GitHub personal access token', secret: true },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, name: 'Private key', secret: true },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, name: 'Slack token', secret: true },
  { re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, name: 'SendGrid API key', secret: true },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, name: 'JWT', secret: 'inspect' },
  { re: /\bpk_live_[A-Za-z0-9]{16,}/g, name: 'Stripe publishable key', secret: false },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, name: 'Google API key', secret: 'inspect' },
];

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || payload.iss || null;
  } catch {
    return null;
  }
}

function parseSetCookie(line) {
  const [pair, ...attrs] = line.split(';').map((s) => s.trim());
  const name = pair.split('=')[0];
  const flags = new Set(attrs.map((a) => a.split('=')[0].toLowerCase()));
  const sameSite = attrs.find((a) => /^samesite=/i.test(a))?.split('=')[1] || null;
  const maxAge = Number(attrs.find((a) => /^max-age=/i.test(a))?.split('=')[1] || NaN);
  return { name, raw: line, httpOnly: flags.has('httponly'), secure: flags.has('secure'), sameSite, maxAge };
}

const SESSIONISH = /(session|sess|auth|token|jwt|sid|sb-|connect\.sid|csrf|remember|login)/i;

async function inspectTls(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      const proto = socket.getProtocol();
      socket.end();
      if (!cert || !cert.valid_to) return resolve(null);
      resolve({
        subject: cert.subject?.CN || null,
        issuer: cert.issuer?.O || cert.issuer?.CN || null,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysRemaining: Math.round((new Date(cert.valid_to) - Date.now()) / 86400000),
        protocol: proto,
        altNames: cert.subjectaltname || null,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
      });
    });
    socket.on('error', (e) => resolve({ error: String(e.message || e) }));
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
  });
}

async function collectPage(browser, url, timeout) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const responses = [];
  const scriptUrls = [];
  page.on('response', async (res) => {
    const headers = await res.allHeaders().catch(() => ({}));
    responses.push({ url: res.url(), status: res.status(), headers });
    const ct = headers['content-type'] || '';
    if (/javascript|ecmascript/.test(ct)) scriptUrls.push(res.url());
  });

  let main = null;
  let navError = null;
  try {
    main = await page.goto(url, { waitUntil: 'load', timeout });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  } catch (e) {
    navError = String(e.message || e);
  }

  // Evaluated as an expression (see collect-perf.mjs), hence the IIFE.
  const forms = navError ? [] : await page.evaluate(`(() => [...document.querySelectorAll('form')].map((f) => ({
    action: f.action || location.href,
    method: (f.method || 'get').toLowerCase(),
    hasPassword: Boolean(f.querySelector('input[type=password]')),
    fieldNames: [...f.querySelectorAll('input,select,textarea')].map((i) => i.name || i.type).slice(0, 20),
  })))()`).catch(() => []);

  const generator = navError ? null : await page.evaluate(
    `(() => document.querySelector('meta[name="generator"]')?.content || null)()`
  ).catch(() => null);

  // Fetch the scripts the page itself loaded, and check for a source map
  // alongside each. Both are URLs the site publicly serves.
  const bundles = [];
  for (const su of [...new Set(scriptUrls)].slice(0, 25)) {
    try {
      const r = await context.request.get(su, { timeout: 15000 });
      if (!r.ok()) continue;
      const body = await r.text();
      const mapRef = body.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/)?.[1] || null;
      let mapReachable = false;
      if (mapRef && !mapRef.startsWith('data:')) {
        const mapUrl = new URL(mapRef, su).href;
        const mr = await context.request.get(mapUrl, { timeout: 15000 }).catch(() => null);
        mapReachable = Boolean(mr?.ok());
        if (mapReachable) bundles.push({ url: su, sourceMap: mapUrl });
      }
      const hits = [];
      for (const p of SECRET_PATTERNS) {
        for (const m of body.match(p.re) || []) {
          const entry = { pattern: p.name, secret: p.secret, sample: `${m.slice(0, 12)}…` };
          if (p.name === 'JWT') entry.role = decodeJwtRole(m);
          hits.push(entry);
        }
      }
      if (hits.length) bundles.push({ url: su, secrets: dedupe(hits) });
    } catch {}
  }

  const wellKnown = {};
  for (const p of WELL_KNOWN) {
    try {
      const r = await context.request.get(new URL(p, url).href, { timeout: 10000 });
      wellKnown[p] = { status: r.status(), body: r.ok() ? (await r.text()).slice(0, 2000) : null };
    } catch {
      wellKnown[p] = { status: null, body: null };
    }
  }

  // Does plain http redirect to https, and in how many hops?
  let httpUpgrade = null;
  const u = new URL(url);
  if (u.protocol === 'https:') {
    try {
      const r = await context.request.get(`http://${u.host}${u.pathname}`, { maxRedirects: 5, timeout: 15000 });
      httpUpgrade = { finalUrl: r.url(), secure: r.url().startsWith('https://'), status: r.status() };
    } catch (e) {
      httpUpgrade = { error: String(e.message || e) };
    }
  }

  await context.close();

  const mainHeaders = main ? await main.allHeaders().catch(() => ({})) : {};
  const setCookies = [];
  for (const r of responses) {
    const sc = r.headers['set-cookie'];
    if (sc) for (const line of sc.split('\n')) setCookies.push(parseSetCookie(line));
  }

  return {
    url, navError,
    status: main?.status() ?? null,
    headers: mainHeaders,
    allResponses: responses.map((r) => ({ url: r.url, status: r.status })),
    cookies: setCookies,
    forms, generator, bundles, wellKnown, httpUpgrade,
  };
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = JSON.stringify(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function analyse(page, tlsInfo) {
  const findings = [];
  const h = page.headers || {};
  const url = page.url;
  const hasAuth = page.forms.some((f) => f.hasPassword) ||
    page.cookies.some((c) => SESSIONISH.test(c.name));

  // --- Missing headers, as ONE finding plus the ones that matter here -------
  const missing = HEADER_CHECKS.filter((c) => !h[c.key] && !(c.alt && c.alt(h)));
  const notable = missing.filter((c) => (hasAuth ? c.withAuth : c.base) !== 'low');
  if (missing.length) {
    findings.push(finding({
      id: 'sec-headers-missing',
      title: `${missing.length} standard security header(s) are not set`,
      severity: 'low', category: 'security', effort: 'quick', url,
      evidence: missing.map((c) => `${c.name} — not present`).join('\n') +
        `\n\nPresent: ${HEADER_CHECKS.filter((c) => h[c.key]).map((c) => c.name).join(', ') || 'none'}`,
      impact: 'These headers are the browser-side defences a site opts into. Individually none of them is a vulnerability; together their absence means a bug elsewhere has nothing standing in its way.',
      fix: 'Set them once at the edge or in middleware so every response carries them: ' +
        missing.map((c) => c.fix).join(' '),
    }));
  }
  for (const c of notable) {
    findings.push(finding({
      id: `sec-header-${c.key}`,
      title: `${c.name} is not set${hasAuth ? ', and the site has signed-in users' : ''}`,
      severity: hasAuth ? c.withAuth : c.base,
      category: 'security', effort: 'quick', url,
      evidence: `Response headers for ${url} contain no \`${c.key}\`.` +
        (hasAuth ? '\nThe site has a login form or session cookie, which is what raises this above hygiene.' : ''),
      impact: c.why,
      fix: c.fix,
    }));
  }

  // --- A CSP that exists but permits everything ----------------------------
  const csp = h['content-security-policy'];
  if (csp && /(unsafe-inline|unsafe-eval)/.test(csp)) {
    findings.push(finding({
      id: 'sec-csp-weak',
      title: 'The Content-Security-Policy allows inline and evaluated scripts',
      severity: 'medium', category: 'security', effort: 'moderate', url,
      evidence: `content-security-policy: ${csp.slice(0, 400)}`,
      impact: "A policy containing `unsafe-inline` or `unsafe-eval` in script-src does not stop injected script from running, which is the main thing a policy is for. Someone configured this expecting protection it is not providing.",
      fix: 'Replace `unsafe-inline` with per-request nonces or hashes for the inline scripts the site genuinely needs, and remove `unsafe-eval` by eliminating the library that requires it.',
    }));
  }

  // --- Cookies --------------------------------------------------------------
  for (const c of page.cookies.filter((c) => SESSIONISH.test(c.name))) {
    const redacted = c.raw.replace(/=([^;]{6})[^;]*/, '=$1…');
    if (!c.httpOnly) {
      findings.push(finding({
        id: `sec-cookie-httponly-${c.name}`,
        title: `Session cookie \`${c.name}\` can be read by JavaScript`,
        severity: 'high', category: 'security', effort: 'quick', url,
        evidence: `set-cookie: ${redacted}\n(no HttpOnly flag)`,
        impact: "A signed-in user's session token is one of the most valuable things on the site. Without HttpOnly, any script on the page — including a third-party tag that is later compromised — can read the token and act as that user.",
        fix: 'Set `HttpOnly` on the cookie wherever the session is issued, alongside `Secure` and `SameSite=Lax`.',
      }));
    }
    if (!c.secure && url.startsWith('https://')) {
      findings.push(finding({
        id: `sec-cookie-secure-${c.name}`,
        title: `Session cookie \`${c.name}\` is not marked Secure`,
        severity: 'medium', category: 'security', effort: 'quick', url,
        evidence: `set-cookie: ${redacted}\n(no Secure flag)`,
        impact: 'The browser will send this cookie over an unencrypted connection if it is ever led into one, where it can be read in transit.',
        fix: 'Add the `Secure` attribute to the cookie.',
      }));
    }
    if (!c.sameSite) {
      findings.push(finding({
        id: `sec-cookie-samesite-${c.name}`,
        title: `Session cookie \`${c.name}\` has no SameSite setting`,
        severity: 'medium', category: 'security', effort: 'quick', url,
        evidence: `set-cookie: ${redacted}\n(no SameSite attribute)`,
        impact: 'Another site can cause a signed-in visitor\'s browser to make requests carrying this cookie, so an action can be performed as that user without them intending it.',
        fix: 'Add `SameSite=Lax` (or `Strict` where no cross-site navigation needs the session).',
      }));
    }
    if (c.maxAge > 60 * 60 * 24 * 180) {
      findings.push(finding({
        id: `sec-cookie-maxage-${c.name}`,
        title: `Session cookie \`${c.name}\` lasts ${Math.round(c.maxAge / 86400)} days`,
        severity: 'low', category: 'security', effort: 'quick', url,
        evidence: `set-cookie: ${redacted}`,
        impact: 'A token that never expires stays usable for as long as it exists, so a copy taken once keeps working indefinitely.',
        fix: 'Shorten the session lifetime and use a refresh mechanism, so a stolen token stops working within hours rather than months.',
      }));
    }
  }

  // --- Secrets in served JavaScript ----------------------------------------
  for (const b of page.bundles.filter((b) => b.secrets)) {
    const real = b.secrets.filter((s) => s.secret === true);
    const inspect = b.secrets.filter((s) => s.secret === 'inspect');
    const serviceRole = inspect.filter((s) => s.role === 'service_role');
    if (real.length || serviceRole.length) {
      const hits = [...real, ...serviceRole];
      findings.push(finding({
        id: `sec-secret-${b.url.slice(-24).replace(/\W/g, '')}`,
        title: `A credential appears in JavaScript served to every visitor`,
        severity: 'critical', category: 'security', effort: 'quick', url: b.url,
        evidence: `${b.url}\n` + hits.map((s) => `  ${s.pattern}${s.role ? ` (role: ${s.role})` : ''}: ${s.sample}`).join('\n'),
        impact: 'This value is downloaded by anyone who opens the site, so it must be treated as already public. Depending on what it grants, that may mean full read and write access to the database or the ability to spend money on the account.' +
          (serviceRole.length ? ' A Supabase `service_role` key in particular bypasses row-level security entirely — it is complete access to every table.' : ''),
        fix: 'Rotate the credential first — removing it from the code does not un-publish it. Then move the operation that needs it to the server, and expose only a public key or an authenticated endpoint to the browser.',
      }));
    }
    if (inspect.length && !serviceRole.length) {
      findings.push(finding({
        id: `sec-key-inspect-${b.url.slice(-24).replace(/\W/g, '')}`,
        title: 'Key-shaped values in client JavaScript — need confirming',
        severity: 'info', category: 'security', effort: 'quick', url: b.url,
        unconfirmed: true,
        evidence: `${b.url}\n` + inspect.map((s) => `  ${s.pattern}${s.role ? ` (role: ${s.role})` : ''}: ${s.sample}`).join('\n'),
        impact: 'Several kinds of key belong in the browser by design — a Stripe publishable key, a Supabase anon key, a Google Maps browser key. These matched the shape of a credential but may be entirely correct. Do not report as a leak without checking which they are.',
        fix: 'Decode each one and confirm what it grants. If it is a public key, note it as expected; if it grants more than a visitor should have, treat it as the critical finding above.',
      }));
    }
  }

  // --- Source maps ----------------------------------------------------------
  const maps = page.bundles.filter((b) => b.sourceMap);
  if (maps.length) {
    findings.push(finding({
      id: 'sec-source-maps',
      title: `Original source code is published alongside ${maps.length} script(s)`,
      severity: 'low', category: 'security', effort: 'quick', url,
      evidence: maps.slice(0, 4).map((b) => `${b.sourceMap} — reachable (HTTP 200)`).join('\n'),
      impact: 'Source maps reconstruct the original, commented source from the minified bundle. This is not a vulnerability by itself, but it hands anyone looking a full map of the internal API routes, feature flags and developer comments, which turns a hard attack into an easy one.',
      fix: 'Stop emitting source maps in production builds, or upload them to the error-tracking service and block the `.map` paths at the edge.',
    }));
  }

  // --- TLS ------------------------------------------------------------------
  if (tlsInfo && !tlsInfo.error) {
    if (tlsInfo.daysRemaining <= 21) {
      findings.push(finding({
        id: 'sec-tls-expiry',
        title: `The HTTPS certificate expires in ${tlsInfo.daysRemaining} day(s)`,
        severity: tlsInfo.daysRemaining <= 7 ? 'high' : 'medium',
        category: 'security', effort: 'quick', url,
        evidence: `Certificate for ${tlsInfo.subject}, issued by ${tlsInfo.issuer}, valid to ${tlsInfo.validTo}.`,
        impact: 'When the certificate expires, every browser shows a full-page security warning instead of the site. This is the single most common reason a small business site goes completely dark for a day.',
        fix: 'Confirm automatic renewal is working. If the certificate is renewed by hand, renew it now and set up automatic renewal.',
      }));
    }
    if (tlsInfo.protocol && /TLSv1(\.[01])?$/.test(tlsInfo.protocol)) {
      findings.push(finding({
        id: 'sec-tls-version',
        title: `Connection negotiated an outdated protocol (${tlsInfo.protocol})`,
        severity: 'medium', category: 'security', effort: 'quick', url,
        evidence: `Negotiated ${tlsInfo.protocol} with ${tlsInfo.subject}.`,
        impact: 'TLS 1.0 and 1.1 have known weaknesses and are rejected by current browsers and by the payment card standards.',
        fix: 'Disable TLS 1.0 and 1.1 at the server or CDN and require TLS 1.2 or above.',
      }));
    }
  }
  if (page.httpUpgrade && page.httpUpgrade.secure === false) {
    findings.push(finding({
      id: 'sec-no-https-redirect',
      title: 'Plain HTTP is served without redirecting to HTTPS',
      severity: 'high', category: 'security', effort: 'quick', url,
      evidence: `http://${new URL(url).host} ended at ${page.httpUpgrade.finalUrl} (HTTP ${page.httpUpgrade.status}) — still unencrypted.`,
      impact: 'Anyone typing the address, following an old link or on a shared network gets the site unencrypted, where the page and anything typed into it can be read and altered in transit.',
      fix: 'Redirect all HTTP traffic to HTTPS with a 301 at the edge, and add HSTS so browsers stop trying HTTP at all.',
    }));
  }

  // --- Technology and version disclosure ------------------------------------
  const disclosed = ['server', 'x-powered-by', 'x-aspnet-version', 'x-generator']
    .filter((k) => h[k]).map((k) => `${k}: ${h[k]}`);
  if (page.generator) disclosed.push(`<meta name="generator"> ${page.generator}`);
  if (disclosed.some((d) => /\d+\.\d+/.test(d))) {
    findings.push(finding({
      id: 'sec-version-disclosure',
      title: 'The server announces its software and version number',
      severity: 'info', category: 'security', effort: 'quick', url,
      evidence: disclosed.join('\n'),
      impact: 'This is not a vulnerability on its own. It matters because it lets anyone check the exact version against the list of published vulnerabilities without touching the site — so an outdated version becomes a target immediately after an advisory is published.',
      fix: 'Suppress version numbers in `Server` and remove `X-Powered-By`. More importantly, check these versions against published advisories now — see the note in the report on whether any apply.',
    }));
  }

  // --- Login form posture (observed, never submitted) ------------------------
  for (const f of page.forms.filter((f) => f.hasPassword)) {
    if (f.action.startsWith('http://')) {
      findings.push(finding({
        id: 'sec-login-plaintext',
        title: 'A password form submits over an unencrypted connection',
        severity: 'critical', category: 'security', effort: 'quick', url,
        evidence: `<form method="${f.method}" action="${f.action}"> containing a password field.`,
        impact: 'The password is sent in the clear and can be read by anyone on the same network or any device the traffic passes through.',
        fix: 'Change the form action to HTTPS and redirect all HTTP traffic to HTTPS.',
      }));
    }
    if (f.method !== 'post') {
      findings.push(finding({
        id: 'sec-login-get',
        title: 'A password form submits by GET',
        severity: 'high', category: 'security', effort: 'quick', url,
        evidence: `<form method="${f.method}" action="${f.action}"> containing a password field.`,
        impact: 'The password ends up in the URL, which is stored in browser history, in server logs and in the referrer sent to other sites.',
        fix: 'Change the form to `method="post"`.',
      }));
    }
  }

  const positives = [];
  if (url.startsWith('https://')) positives.push('The site is served over HTTPS.');
  if (page.httpUpgrade?.secure) positives.push('Plain HTTP correctly redirects to HTTPS.');
  if (h['strict-transport-security']) positives.push('HSTS is configured.');
  if (csp && !/(unsafe-inline|unsafe-eval)/.test(csp)) positives.push('A Content-Security-Policy is set and does not permit inline or evaluated scripts.');
  if (tlsInfo?.daysRemaining > 21) positives.push(`The HTTPS certificate is valid for another ${tlsInfo.daysRemaining} days.`);
  if (!page.bundles.some((b) => b.secrets?.some((s) => s.secret === true))) positives.push('No credentials were found in the JavaScript served to visitors.');
  if (page.cookies.filter((c) => SESSIONISH.test(c.name)).every((c) => c.httpOnly && c.secure)) {
    if (page.cookies.some((c) => SESSIONISH.test(c.name))) positives.push('Session cookies are set HttpOnly and Secure.');
  }

  return { findings, positives, hasAuth };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = args._.map(assertPassiveTarget).map(String);
  if (!urls.length) {
    console.error('usage: check-headers.mjs <url...> --out DIR');
    process.exit(1);
  }
  const outDir = args.out || path.join(process.cwd(), 'audit-out');
  const timeout = Number(args.timeout || 30000);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  const pages = [];
  const findings = [];
  const positives = new Set();
  try {
    for (const url of urls) {
      process.stderr.write(`  ${url} … `);
      const page = await collectPage(browser, url, timeout);
      const tlsInfo = url.startsWith('https://') ? await inspectTls(new URL(url).hostname) : null;
      const a = analyse(page, tlsInfo);
      for (const p of a.positives) positives.add(p);
      findings.push(...a.findings);
      pages.push({ ...page, tls: tlsInfo, hasAuth: a.hasAuth });
      process.stderr.write('done\n');
    }
  } finally {
    await browser.close();
  }

  // The same header is missing on every page; report it once.
  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).sort(bySeverityThenEffort);

  const file = writeJson(outDir, 'security', {
    tool: 'check-headers', mode: 'passive', collectedAt: new Date().toISOString(),
    command: `node check-headers.mjs ${urls.join(' ')}`,
    urls, pages, findings: unique, positives: [...positives],
  });
  summarise('Security (passive)', unique);
  console.log(`\nWrote ${file}`);
  console.log('Reminder: these checks are passive. Anything active needs written authorisation first.');
}

main().catch((e) => { console.error(e); process.exit(1); });
