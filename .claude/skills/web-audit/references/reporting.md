# Writing the report someone acts on

The report is the product. The measurements are raw material. A perfect audit
written up badly gets skimmed and filed; a modest audit written well gets a
reply the same day.

## Who reads it, in what order

Three people, and the document has to work for all three:

1. **The owner.** Non-technical. Reads the first page and the headings. Decides
   whether there is a problem and whether you sound like someone to trust.
2. **Whoever built the site** — an agency, a freelancer, a nephew. The owner
   forwards it to them. This person is looking for a reason to say you are
   wrong, and they are the reason every claim carries evidence and a
   reproduction command.
3. **Whoever eventually does the work.** Needs the fix to be specific.

Write the summary for the first, the evidence for the second, the fixes for
the third. Do not write three documents.

## Structure

```
1. Summary                     ≤ 1 page, plain language, no jargon
2. What we measured            method, date, URLs, profile, tools — short
3. What is working well        3–5 bullets, honest
4. Findings                    severity order, one section each
5. What we would do first      a sequenced plan, not a list
6. Appendix: hygiene           the low-severity hardening list
7. Appendix: raw measurements  tables, headers, the reproduction commands
```

### 1. The summary

The whole thing turns on this page. It has to be readable by someone who does
not know what a header is, and it must not overclaim.

State, in four or five sentences: what you looked at, the single most
important thing you found, the count of findings by severity, and what you
recommend doing first. No metric names. No tool names.

> We looked at four pages of example.com on 10 September 2026, testing how
> they load on a typical mobile phone and what the site reveals about itself
> to the public internet.
>
> The clearest problem is speed: on a phone, the shop page takes about six
> seconds before customers see anything they came for. Most of that is one
> oversized image and a set of scripts that block the page while they load —
> both fixable in under a day, without redesigning anything.
>
> We also found one security issue we would want fixed this week: the login
> cookie can be read by any script running on the page, which makes an account
> takeover much easier if any third-party script on the site is ever
> compromised.
>
> In total: 1 high, 4 medium and 6 low-severity items. Nothing suggests the
> site has been attacked. The full list, with evidence, follows.

Note what that does. It is specific enough to be credible, it names an effort
("under a day") which makes the next conversation about money instead of
doubt, and it says *nothing suggests the site has been attacked* — because the
owner's first fear on reading the word "security" is that something has
already happened, and leaving that unanswered makes them defensive rather than
interested.

### 3. What is working well

Three to five true things. HTTPS configured correctly, images already
compressed, no exposed secrets, a recent framework version. This section costs
you nothing, you already have the data, and it does more for your credibility
than any finding. A report that is entirely negative reads as a sales
document, because that is usually what it is.

### 4. Findings

One consistent shape, every time:

```
### Session cookie is readable by JavaScript          [High · Quick fix]

**What we found.** The cookie that keeps a user signed in is set without the
HttpOnly flag, which means any JavaScript running on the page can read it.

**Evidence.** Response to POST /api/auth/login, 10 Sep 2026:
    set-cookie: sb-access-token=eyJhbGci…; Path=/; SameSite=Lax

**Why it matters.** A signed-in user's session token is one of the most
valuable things on the site. Without this flag, any script that ends up on the
page — a compromised analytics tag, an ad, or a cross-site scripting bug — can
read the token and use it to act as that user. With the flag set, the browser
will not hand the token to scripts at all.

**How to fix it.** Add `httpOnly: true` to the cookie options where the
session is set, alongside `secure: true` and `sameSite: 'lax'`. In this
codebase that is one call site.

**Effort.** Under an hour, including a test that a signed-in session survives.
```

Rules that hold for every finding:

- **The heading is the finding**, in plain words. Not "CWE-1004" and not
  "Cookie misconfiguration" — a sentence a non-technical reader understands.
- **Severity and effort in the heading**, together. Severity alone creates
  anxiety; severity with "quick fix" creates a decision.
- **Evidence is quoted, not described.** Trimmed to the relevant line, with
  the date and the request it came from. Redact the actual token value.
- **"Why it matters" is about their business**, not about the mechanism. One
  short paragraph. This is the part people read.
- **The fix is concrete.** If you have the repo, name the file. If you do not,
  name the setting or the configuration.
- **No finding without evidence.** If you cannot quote something you observed,
  it does not go in the report.

Order strictly by severity, and within a severity by effort ascending — so the
quick wins are at the top of each band.

### 5. What we would do first

Not a repeat of the list. A sequence, with reasoning, that reads as if you
already work there:

> **This week** — the cookie flag and the compression setting. Both are
> configuration, both are under an hour, and between them they close the one
> security item and cut roughly 40% off what every visitor downloads.
>
> **Next** — the images on the shop and product pages. This is the largest
> single improvement available and the work is mechanical: about a day.
>
> **Later, if worth it** — the JavaScript weight. Real gains, but it means
> changing how the site is built, so it belongs in the next round of work
> rather than as an emergency.

This section is where the engagement gets sold, and it sells by being a plan
rather than a pitch.

## Tone

- **Plain words.** "The page takes six seconds to appear", not "LCP is
  degraded". Technical terms belong in the evidence and the appendix, where
  the developer is reading.
- **Never blame whoever built it.** They are frequently in the room, often
  the person deciding whether you get hired, and the problems are usually the
  ordinary result of shipping under a deadline. "This is common and easily
  fixed" costs nothing and keeps them on your side.
- **No fear.** No "urgent", no "at risk of attack" unless you can show that it
  is. The findings are alarming enough where they are real.
- **No invented numbers.** No revenue estimates, no "this costs you £X a
  month", no conversion percentages borrowed from someone else's study. State
  what you measured; let the owner apply it to their own business.
- **Own the limits.** One line: what you did not test, and why. "We tested
  only public pages, since we did not have login access — the signed-in part
  of the site is where most of the code lives and we would expect to find more
  there." That sentence is honest and it scopes the next engagement.

## The generator

`scripts/report.mjs` reads the collectors' JSON and writes `report.html` and
`report.md` with the structure above, the findings sorted, the evidence
tables filled in and the reproduction commands appended. What it cannot write
is the summary, the "what we would do first" plan, or the judgement about
which findings are real — those are the sections it leaves marked
`<!-- TODO -->`, and a report that goes out with those still in it is worse
than no report.

Two practical notes:

- **`report.html` is self-contained** — styles inline, no external requests —
  so it survives being emailed, and prints to PDF from a browser cleanly.
  Owners overwhelmingly prefer a PDF.
- **Put a date and the tested URLs on the front page.** Sites change. A report
  without a date will be argued with in three months when the finding is gone.
