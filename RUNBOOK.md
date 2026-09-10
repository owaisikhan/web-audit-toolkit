# Auditing a new site, end to end

The commands for a full audit, in order, with the judgement steps left in —
because the parts that are not commands are the parts that make the report
worth sending. Written from the Saam's Store run of 10 Sep 2026.

Read `.claude/skills/web-audit/SKILL.md` for the method. This is the
mechanics.

---

## 0. Settle scope first

Ask, and do not skip it because the site is public:

> Whose site is this? Do we have permission? Live site, staging, or the
> repository? Is there a login behind which most of the app lives?

| Situation | What may run |
|---|---|
| Public site, no permission | `collect-perf` + `check-headers`. Passive only. |
| Written permission | The above, plus authenticated pages and `scan-source` on their repo. |
| Our own site and repo | Everything. |

The scripts are passive-only and have no active mode. Do not add one. Full
statement of the line: `.claude/skills/web-audit/references/security.md`.

## 1. Set up

```bash
SKILL=.claude/skills/web-audit
SLUG=their-name                      # lowercase, hyphenated, stable forever
OUT=audits/$SLUG/$(date +%F)         # audits/their-name/2026-09-10
mkdir -p $OUT
```

Everything lands in `$OUT`. It is gitignored — see `audits/README.md` for why
that is not negotiable on a public repo.

## 2. Find the pages worth measuring

The homepage is the most optimised page on almost every site. Get the real
ones — a listing, a product, the cart, a search result — from the links the
site itself serves. This is passive: you are reading what it hands you.

```bash
curl -s https://example.com/ -o /tmp/home.html \
  -w "status=%{http_code} bytes=%{size_download}\n"

grep -oE 'href="/[^"?#]*"' /tmp/home.html | sed 's/href="//;s/"//' | sort -u | head -30

# Status, size and server response time for the candidates:
for p in / /shop /products/some-slug /cart /checkout; do
  printf "%-24s " "$p"
  curl -s -o /dev/null -w "status=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}s\n" \
    --max-time 20 "https://example.com$p"
done

# Worth knowing before you start:
curl -s https://example.com/robots.txt  -w "\n[%{http_code}]\n" | head -5
curl -s https://example.com/sitemap.xml -w "\n[%{http_code}]\n" | head -5
grep -o '<meta name="robots"[^>]*>' /tmp/home.html   # noindex on a live shop is a finding
```

## 3. Collect

Nothing is interpreted yet. Three or four pages, three runs each — a single
cold load is not evidence and you will be asked to reproduce it.

```bash
node $SKILL/scripts/collect-perf.mjs \
  https://example.com/ \
  https://example.com/shop \
  https://example.com/products/some-slug \
  https://example.com/cart \
  --out $OUT --runs 3 --all-profiles

node $SKILL/scripts/check-headers.mjs \
  https://example.com/ https://example.com/shop https://example.com/cart \
  --out $OUT
```

With the repo in hand:

```bash
git clone --depth 1 https://github.com/owner/repo /tmp/their-repo
node $SKILL/scripts/scan-source.mjs /tmp/their-repo --out $OUT
```

Flags worth knowing: `--runs N`, `--profile mobile|desktop`, `--all-profiles`,
`--timeout MS`, and `scan-source --no-audit` to skip `npm audit`.

**If every page fails with `ERR_CONNECTION_RESET`**, you are in a Claude Code
web session — see the TLS 1.3 section of `README.md`. Do not report those as
findings about the site; they are about your sandbox.

## 4. Look at the screenshots

Not optional, and not something a collector can do for you. The one finding on
Saam's Store that was plausibly costing sales — a floating chat button sitting
on top of the add-to-cart control, on the listing page, at phone width — was
invisible in every JSON file and obvious in one screenshot.

```bash
ls $OUT/screenshots/
```

Open the mobile ones. A site can pass every metric and still be unusable on a
phone.

## 5. Triage before you generate

Go through every finding and ask, in order:

1. Can a stranger use this to cause harm? Then it is critical whatever the
   scanner said.
2. Does it cost them customers today?
3. Would fixing it take an afternoon?
4. **Is it actually true on this site?**

Question 4 is where credibility is won. On Saam's Store, `npm audit` reported a
critical Next.js RCE that applies only to Windows-hosted servers (they are on
Vercel) and a second that requires AVIF (not enabled). Both were dropped. The
scanner also flagged "an endpoint with no authorisation check" that turned out
to be a deliberately public chatbot — while the admin area, which it could not
see into, was properly gated at both the layout and every server action.

Reading the code beats trusting the pattern match. Check these by hand:

```bash
# Does a "no auth check" endpoint actually need one?
sed -n 1,60p /tmp/their-repo/app/api/whatever/route.js

# Are server actions guarded, or only the pages? (Next.js: a layout guard
# does NOT protect a server action — it is a directly invocable endpoint.)
grep -rl '"use server"' /tmp/their-repo/app
grep -n "requireAdmin\|getClaims\|ADMIN_EMAIL" /tmp/their-repo/app/_lib/actions.js

# Advisories: which are production, which are reachable from what ships?
cd /tmp/their-repo && npm audit --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for n,v in d.get('vulnerabilities',{}).items():
    print(f\"{n:22} {v['severity']:9} direct={v.get('isDirect')}\")
"
```

If a guard looks thin, test it directly rather than guessing — copy the
function out and call it. That is how the Saam's Store SQL allowlist bypass
went from a suspicion to a quoted result, without sending anything at the live
site:

```bash
mkdir -p /tmp/guardtest && cd /tmp/guardtest
cp /tmp/their-repo/app/_lib/chatbot/{sqlGuard,schema}.js .
sed -i 's#"./schema"#"./schema.js"#' sqlGuard.js
# then a small .mjs that imports it and prints allowed/blocked per case
```

## 6. Generate

```bash
node $SKILL/scripts/report.mjs --out $OUT \
  --site "Their Company Ltd" \
  --url https://example.com \
  --by "Your Name" \
  --drop id1,id2,id3
```

`--drop` takes finding ids from the JSON. Use it for anything triage killed,
and for duplicate ids repeated across pages — six near-identical cards is the
signature of a generated report and the technical reader will spot it. Collapse
those into one hygiene entry you write yourself.

## 7. Finish the report by hand

The generator scaffolds; it does not think. It leaves `<!-- TODO -->` markers
in the summary and the plan, **and a report that goes out with those in it is
worse than no report.** Read
`.claude/skills/web-audit/references/reporting.md` before writing them.

What always needs hand-work:

- **The summary.** Four or five sentences, plain language, no metric names.
  Say whether anything suggests the site has already been attacked — that is
  the owner's first fear and leaving it unanswered makes them defensive.
- **The plan.** A sequence with reasoning, not a repeat of the list.
- **"What is working well."** Three to five true things. Costs nothing, and a
  wholly negative report reads as a sales document.
- **Findings the collectors cannot produce** — anything from the screenshots
  or from reading the code. Match the existing `<article class="finding …">`
  markup.
- **"What we did not test."** One honest paragraph. It scopes the next
  engagement better than any pitch.

```bash
grep -c TODO $OUT/report.html $OUT/report.md    # must be 0 before sending
```

`report.md` is generated too. If you only finish the HTML, delete the markdown
rather than shipping a half-written twin.

## 8. Look at the finished report

At a laptop width and a phone width, rendered — not by reading the markup.

This repo has no `node_modules`, so borrow the skill's own browser loader
rather than importing `playwright` directly:

```bash
cat > /tmp/view.mjs <<'EOF'
const [, , reportPath, libPath] = process.argv;
const { loadPlaywright, findChromium } = await import(libPath);
const pw = await loadPlaywright();
const b = await pw.chromium.launch({ executablePath: findChromium() });
for (const [w, name] of [[1152, 'desktop'], [400, 'phone']]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  await p.goto('file://' + reportPath);
  await p.screenshot({ path: `/tmp/view-${name}.png`, fullPage: true });
  console.log(name, 'horizontal overflow:',
    await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await p.close();
}
await b.close();
EOF

node /tmp/view.mjs "$PWD/$OUT/report.html" "$PWD/$SKILL/scripts/_lib.mjs"
```

Both paths are passed in as absolute arguments deliberately: a relative
`import` inside a script in `/tmp` resolves against `/tmp`, not your working
directory.

Zero is the horizontal overflow you want at both widths. Then actually open the
images. Check the evidence blocks have not wrapped into nonsense — long lines
in a `<pre>` are the usual casualty.

## 9. Before it leaves

- `git status` — clean. Audit output is gitignored and must stay out of a
  public repo.
- Send the client `report.html` directly. It is self-contained and prints to
  PDF from a browser; owners overwhelmingly prefer the PDF.
- Keep the run directory. Two audits of the same site months apart is the most
  persuasive thing this toolkit produces, and it costs nothing to keep.
