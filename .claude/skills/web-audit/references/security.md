# Finding real exposure without becoming the incident

## The boundary, stated once, precisely

Testing a computer system you do not own, without authorisation, is a criminal
offence in most places — the UK Computer Misuse Act, the US CFAA, Pakistan's
PECA, and equivalents elsewhere. None of them require that you caused damage,
and "I was going to offer to fix it" is not a defence. This is not a
liability disclaimer; it is the difference between a business development
activity and a prosecution.

The line is **whether you are making requests an ordinary visitor's browser
makes, or requests designed to find a weakness**.

**Passive — safe on any public site, no permission needed.** This is what you
run on a prospect.

- Loading the site's public pages in a browser, as a visitor.
- Reading the response headers, cookies and TLS certificate the server sends.
- Reading JavaScript, CSS and source maps the site publicly serves.
- Fetching `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` — files
  whose entire purpose is to be fetched.
- Observing what framework and version the site announces about itself.
- Checking published CVEs against a version the site itself disclosed.

**Active — requires written permission, naming the scope and the dates.**

- Requesting paths you were not linked to, to see what exists. Directory and
  file enumeration, including "just checking if `/admin` is there", and
  including automated `robots.txt`-derived path probing.
- Submitting anything to a form, endpoint or parameter to see how it responds.
- Any payload: SQL, script, template, path traversal, command injection.
- Login attempts with credentials that are not yours, including defaults.
- Rate-limit, brute-force or denial-of-service probing.
- Running `nikto`, `sqlmap`, `nuclei`, `zap`, `burp` active scan, or any other
  vulnerability scanner.
- Scanning ports.

**The scripts in this skill are passive-only and have no active mode.** If a
job needs active testing, it needs a signed scope agreement first, and that is
a different engagement with a different document at the front of it. Do not
add an active mode to these scripts to get around this.

When something you find passively *suggests* a serious flaw you cannot confirm
without an active test, that is still a finding — write it as what you
observed plus what it would mean, explicitly flagged as unconfirmed, and offer
the test as the first item of paid work. That framing is more honest and sells
better than a confirmed finding you had no right to obtain.

### If you find something serious on a site you do not own

Disclose it privately and promptly, before any sales conversation. Check
`/.well-known/security.txt` for a contact. Do not publish it, do not put the
working details in a document that will be forwarded around, and do not use it
as leverage — "I found a hole, hire me and I'll tell you what it is" is
extortion-shaped, and it reads that way to the recipient. Tell them what it
is, tell them how to fix it, and let the goodwill do the selling.

---

## The passive checklist

`scripts/check-headers.mjs` automates most of this. The judgement it cannot
make is which findings matter on this particular site, which is yours.

### Response headers

| Header | What its absence means | Severity when absent |
|---|---|---|
| `Strict-Transport-Security` | The first visit each session can be downgraded to HTTP and intercepted. On any site with a login or payment, this matters. | Medium, High with auth |
| `Content-Security-Policy` | No defence in depth against XSS. Weight this by whether the site takes user input and how much third-party script it runs. | Low → High |
| `X-Content-Type-Options: nosniff` | Browsers may execute a file as a type it was not served as. | Low |
| `X-Frame-Options` / CSP `frame-ancestors` | The site can be framed invisibly over an attacker's page and clicks stolen. Real when there are buttons that do things while logged in. | Medium with auth |
| `Referrer-Policy` | Full URLs, including anything sensitive in a path or query string, leak to every external site linked or loaded. | Low |
| `Permissions-Policy` | Embedded third parties can use camera, microphone, geolocation. | Info |

**Do not report all six as a block of "missing security headers" and call it
six findings.** That is the signature move of an automated report and the
technical reviewer will spot it. Group them into one finding — "several
standard security headers are not set" — with the table, and pull out
separately only the one or two that actually matter for this site, with the
reason they matter *here*.

A `Content-Security-Policy` that exists but contains `unsafe-inline` and
`unsafe-eval` in `script-src` is worth more attention than one that is absent:
it means someone tried, and the policy currently stops nothing. That is a
genuine, specific, fixable finding.

### Cookies

Read every `Set-Cookie`. For any cookie that looks like a session or auth
token:

- **`HttpOnly` missing** — any script on the page, including a compromised
  third-party tag, can read the session token. On a session cookie this is
  **High**.
- **`Secure` missing** — the cookie is sent over plain HTTP if the browser is
  ever tricked into one request. **Medium**, High with HSTS also absent.
- **`SameSite` absent or `None` without cause** — CSRF surface. **Medium**.
- **A session cookie with a year-long `Max-Age`** — a stolen token stays valid
  forever. Worth a line.

### TLS

Certificate validity and expiry date, issuer, and whether the hostnames
actually match. An expiry inside 21 days is a finding on its own: it is the
single most common cause of a small business's site going completely dark for
a day, and telling them about it before it happens is the cheapest possible
demonstration that you were paying attention.

Check that `http://` redirects to `https://`, and that it does so in one hop.

### What the site tells you about itself

`Server`, `X-Powered-By`, `X-AspNet-Version`, `X-Generator`, a WordPress
`readme.html`, a `/wp-json/` response, a Next.js build id, framework-specific
paths. Version disclosure is **Info** on its own — it is not a vulnerability,
and reporting it as one is padding.

It becomes a real finding when the disclosed version is **known-vulnerable**.
Then you have: the site told you its version, that version has published CVEs,
here they are with severity, the fix is an upgrade. That is a legitimate,
entirely passive **High** or **Critical** finding, and it is the strongest
thing you will typically get from outside. WordPress installs and their
plugins are where this lands most often.

### Publicly served source

Everything below is fetched only from URLs the site's own HTML references, or
from the standard well-known paths.

- **Source maps in production.** A `.js.map` reachable next to a bundle hands
  over the original, commented source. Not a vulnerability by itself, but it
  turns every other weakness into an easy one, and it frequently contains
  internal API routes and comments the owner would not choose to publish.
- **Secrets in client bundles.** The collector greps served JavaScript for
  key-shaped strings: `sk_live_`, `AKIA…`, Google API keys, JWTs, private key
  headers, `service_role` tokens. **Any secret in client JavaScript is
  Critical** — it is already public, and the fix starts with rotating it, not
  with removing it from the code.
  - The trap: plenty of keys in client code are *meant* to be there. A Stripe
    **publishable** key, a Supabase **anon** key, a Google Maps browser key,
    a public analytics id. Reporting one of those as a leaked secret destroys
    your credibility in one line. Know the difference before you write it up.
  - For Supabase specifically: an `anon` key in the browser is correct and by
    design; a `service_role` key in the browser is a total compromise of the
    database, because it bypasses RLS entirely. Both are JWTs and they look
    alike at a glance — decode the payload and read the `role` claim.
- **`/.env`, `/.git/config`, `/config.json`, backups like `db.sql`.** Only
  check these where the site links them or the server directory-lists them.
  Guessing them is enumeration, which is active. In practice you find these
  through an exposed directory listing, which is itself the finding.

### Forms and auth, observed only

Without submitting anything you can still see, from the markup and the
network log:

- A login form posting over `http://`, or to a different origin.
- A password field with `autocomplete` misconfigured, or no rate-limit hint.
- A form with no CSRF token where the framework does not provide one
  automatically.
- API endpoints visible in the page's JavaScript that suggest an unauthorised
  path — note them as things to test **once authorised**, never test now.

---

## When you have the repository

`scripts/scan-source.mjs` covers the mechanical part. What it finds still
needs reading in context — a `dangerouslySetInnerHTML` fed by a hard-coded
constant is fine, and reporting it is noise.

**Dependencies.** `npm audit --json` is the start, not the finding. A critical
advisory in a transitive dev dependency used only by the build is not a
critical vulnerability in their website, and saying it is will get your whole
report discounted. Separate production from development, and check whether the
vulnerable code path is reachable from anything the site serves.

**Secrets in the repository and its history.** `.env` files committed,
credentials in config, keys in test fixtures. Check the history as well as the
working tree — a key removed in a later commit is still public forever in an
open repo, and still needs rotating.

**Authorisation, not just authentication.** The recurring, high-value bug in
small business apps is not a missing login — it is a route that checks *that*
you are logged in but not *whether you are allowed*, so any signed-in user can
read another's data by changing an id. Enumerate every route and every server
action, and for each one ask what stops user A from reading user B's row. If
the answer is "the UI does not show them the link", that is the finding, and
it is usually High or Critical.

For **Supabase** apps specifically, in order of how often they are wrong:
1. **RLS not enabled** on a table that the anon key can reach. With RLS off,
   the anon key reads the whole table. Check every table, not the obvious ones.
2. **A permissive policy** — `using (true)` on a select policy is RLS enabled
   and doing nothing.
3. **A `service_role` key reachable from client code** — see above, Critical.
4. **Server actions and route handlers that trust a client-supplied user id**
   instead of reading the session server-side.

**Injection surface.** Raw SQL built by string concatenation. Shell commands
built from request data. `eval`, `new Function`, and template rendering of
user input. Path joins from user input reaching the filesystem — a
`../../` traversal in a file-download route is a classic in exactly this kind
of app.

**Output escaping.** `dangerouslySetInnerHTML`, `v-html`, `innerHTML =` with
anything that reaches user input. Follow the value back to its source before
reporting.

**Server-side rendering leaks.** Data fetched on the server and serialised
into the page for hydration includes everything on the object, not just the
fields rendered. A user record passed to a client component ships the password
hash, the email and the internal flags in the HTML. Grep for whole rows
crossing the server/client boundary.

**Rate limiting and cost.** A login endpoint, a password reset, a search, or
anything that sends an email or an SMS, with no rate limit. The consequence is
sometimes a breach and sometimes a bill, and the bill argument lands better
with an owner.

---

## Writing security findings without crying wolf

The owner has probably received an automated "your website has 47 critical
vulnerabilities" email from someone selling something. Do not sound like it.

- **Lead with the two or three that are real.** Put the hardening list in an
  appendix, clearly labelled as hygiene rather than exposure.
- **Say what an attacker would actually get.** Not "possible XSS" but "a
  comment posted by any visitor can run code in the browser of the next person
  to view that page, including the admin, whose session it could take."
- **Never include a working exploit** in a document that will be emailed
  around. Describe the flaw; keep the proof-of-concept for a private technical
  handover.
- **Mark unconfirmed findings as unconfirmed**, in the finding itself, not in a
  disclaimer at the end.
- **Say what is right, too.** A short list of what the site does correctly
  makes the rest believable and costs you nothing — you already collected it.
