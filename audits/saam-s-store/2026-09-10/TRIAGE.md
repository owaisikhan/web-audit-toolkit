# Saam's Store — triage notes, 2026-09-10

Source half only. The live half (collect-perf, check-headers) did not run:
this session's egress policy answered 403 to CONNECT for
saam-s-store.vercel.app:443. Nothing below is inferred from the live site.

Repo scanned: Ammar-Sagheer/saam-s-store @ b437364 (shallow clone).
Next 16.2.12, React 19.2.4, Supabase + Stripe + a LangGraph/Gemini chatbot.

## Kept, and why

### 1. The chatbot's SQL allowlist can be bypassed with a comma join
`app/_lib/chatbot/sqlGuard.js:31` extracts table names with
`/\b(?:from|join)\s+"?([a-z_]+)"?/g`, which reads only the FIRST table after
each FROM/JOIN. A comma-separated table list is never checked.

Demonstrated by running their own validateSelectOnly() in isolation:

    SELECT * FROM products JOIN orders ON true      -> blocked (Table not allowed: orders)
    SELECT * FROM products WHERE id IN
      (SELECT product_id FROM orders)               -> blocked (Table not allowed: orders)
    SELECT * FROM products, orders                  -> ALLOWED
    SELECT * FROM products, pg_stat_activity        -> ALLOWED
    SELECT pg_sleep(30)                             -> ALLOWED  (no FROM, so no table check)

Reachable unauthenticated: app/api/chat/route.js has no auth by design (it is
a storefront chatbot) and returns `rows` and `sqlUsed` to the caller. The SQL
is written by Gemini from visitor text, so the delivery vehicle is prompt
injection, not a crafted request.

SEVERITY DEPENDS ON ONE FACT I COULD NOT ESTABLISH FROM THE REPO — see below.

### 2. What SELECT grants does chatbot_readonly actually hold? (UNCONFIRMED)
.env.example and PROJECT_CONTEXT.md both state the safety model is that the
role "physically cannot write". That covers writes. Nothing in the repo says
which tables it can READ. The app's own Supabase calls show orders, addresses,
profiles, contacts and wishlist_items all exist.

Verify with one query, as chatbot_readonly:

    SELECT table_schema, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'chatbot_readonly'
    ORDER BY table_schema, table_name;

- Grants limited to products/categories/product_images (+ knowledge_base):
  the bypass is contained by the role. Finding drops to MEDIUM — a
  defence-in-depth layer that does not hold, worth fixing, not an emergency.
- Any SELECT on orders/addresses/profiles/contacts: CRITICAL. Customer names,
  addresses and order history are reachable by an anonymous visitor through
  the chat box, and the role being read-only does not help.

Do not report a severity until this is answered.

### 3. No rate limiting on /api/chat
grep for rate.?limit|throttle across app/, next.config.mjs and proxy.js: no
hits. Every anonymous POST runs a LangGraph pipeline: embedding + SQL
generation + answer generation, and with `voice: true` a TTS call too
(maxDuration 60). Cost is on their Gemini key; there is no per-IP or
per-session ceiling. Also a small-pool DoS: pg Pool max is 5 with a 10s
connection timeout, and `SELECT pg_sleep(30)` passes the guard.

### 4. executeQuery fetches the whole result, then slices
app/_lib/chatbot/db.js:29 — `result.rows.slice(0, limitRows)`. The LIMIT is a
prompt instruction to Gemini, not something enforced in SQL. A query without
one materialises every row in the function's memory before 20 are kept.

### 5. sharp + an image optimizer pointed at user-controllable hosts
next.config.mjs allows remotePatterns for lh3.googleusercontent.com and
upload.wikimedia.org with no pathname restriction. lh3.googleusercontent.com
serves user-uploaded content, so an attacker can choose the bytes that reach
the image optimizer. sharp is on an advisory for four libvips CVEs. Chain is
plausible, unproven — flag as unconfirmed, moderate effort to fix by pinning
pathname prefixes and upgrading sharp.

## Dropped, and why

- **Next.js critical RCE (windows-hosted servers).** Deployed on Vercel,
  which is Linux. Not applicable. Reporting it as critical would be the
  fastest way to lose the technical reader.
- **Next.js RCE via Image Optimization AVIF.** Requires AVIF to be enabled.
  next.config.mjs sets no `formats`, so the default (webp) applies. Not
  applicable as configured. Worth a line saying do not enable AVIF before
  upgrading.
- **"1 server endpoint shows no authorisation check" as written.** True only
  of /api/chat, which is deliberately public. The scanner could not see that
  app/admin/layout.js gates admin pages on claims.email === ADMIN_EMAIL, and
  that all 8 mutating server actions in app/_lib/actions.js call
  requireAdmin() which throws. Admin authorisation on this app is sound and
  the report should say so — it is a credibility deposit.
- **brace-expansion / browserslist / js-yaml / nanoid / postcss advisories.**
  Build-time and transitive. No reachable path from anything the site serves.
  Worth one grouped hygiene line, not five findings.

## Still to do
- collect-perf.mjs and check-headers.mjs once the host is reachable.
- Pages worth measuring beyond the homepage: /shop, /products/<slug>,
  /cart, /checkout.
- Then report.mjs. Do not generate the report from source.json alone; a
  storefront audit without a single load-time number is not the deliverable.

---

# Live half — completed 2026-09-10 20:08 UTC

Network policy was changed to Full mid-session and this session picked it up.
Ran collect-perf (4 pages, 3 runs, mobile+desktop) and check-headers (3 pages).

## Environment caveats — READ BEFORE REUSING THESE NUMBERS

1. **Chromium could not reach any external HTTPS host** through the agent
   proxy: the TLS 1.3 handshake dies (ClientHello out, 39 B back, tunnel
   closed at 6s) while curl through the same proxy succeeds. The first perf
   run produced 8 "Page could not be loaded" findings that were PURE
   ARTEFACT — that file was discarded, not reported. Worked around with a
   wrapper at $SCRATCH/pw-shim/chromium/chrome-linux/chrome that adds
   --ssl-version-max=tls1.2 and is found via PLAYWRIGHT_BROWSERS_PATH. No
   change to certificate verification, and no edit to the skill.

2. **The TLS block in security.json is the PROXY's certificate, not
   Vercel's** — issuer "Anthropic", 30 days remaining. Any TLS/expiry
   finding from this run is invalid. The generator's "certificate is valid
   for another 30 days" line was removed from the report by hand.

3. **Timings are measured from iad1, next to the Vercel edge** (x-vercel-id
   iad1, cache HIT, TTFB 43-55 ms). Page-to-page comparison is sound;
   absolute numbers flatter the site versus a real customer in PK/AU. Stated
   as a limit in the report rather than buried.

## Live results
All four pages rate "good" on all four Core Web Vitals except /cart mobile
LCP 2.75 s (threshold 2.50). CLS 0.000-0.001 everywhere. HSTS present with
preload; brotli on; CSP, X-Content-Type-Options, X-Frame-Options and
Referrer-Policy absent. Only key-shaped value in the bundles is the Supabase
anon JWT — public by design, decoded and confirmed, reported as a positive.

## Added from the screenshots (nothing else would have found it)
The chat FAB is fixed bottom-right and covers the round add-to-cart button on
the bottom-right tile of the 2-up product grid at phone width. /shop only —
the product page's full-width ADD TO CART is clear of it. Reported medium.

## Report
report.html only. The generated report.md was DELETED rather than shipped: it
still carried the summary/plan TODO markers, and reporting.md is explicit that
a report sent with those in it is worse than no report. Findings dropped from
the generated scaffold via --drop: perf-fonts (6 near-identical duplicates,
rewritten as one hygiene entry), sec-key-inspect-* (verified benign),
src-unguarded-endpoints and src-dependency-vulns (both true but misleading as
worded — rewritten by hand with the Windows-only and AVIF-only RCEs marked
not-applicable).

## Still open
- The chatbot_readonly grants query. Until it is answered the headline
  finding's severity is provisional: High as written, Critical if that role
  can read orders/addresses/profiles.
- Signed-in area never tested (no customer account). Account pages, order
  history and checkout past step one are unexamined.
