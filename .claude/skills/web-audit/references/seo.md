# Technical SEO, and what it is honest to claim

`scripts/check-seo.mjs` reads what a search engine reads: the head tags, the
heading outline, the indexability directives, and the links a page publishes.
It is passive in exactly the sense the rest of this skill means. It requests
the URLs given, `robots.txt`, and the same-origin links those pages themselves
publish, honouring `robots.txt` as it goes.

## Say what this is, before the client assumes something else

"SEO" means one thing to you and a different thing to a shop owner. To them it
usually means *"why am I not first when someone searches for my product"*. This
collector does not answer that, and pretending otherwise is the fastest way to
lose the engagement two months in.

**What it can tell you**, from the outside, with evidence:

- whether search engines are permitted to list the site at all
- whether each page tells a searcher what it is, in the text they see in results
- whether the page structure is readable by a crawler and a screen reader
- whether the site links to pages that no longer exist

**What it cannot tell you**, and no amount of crawling will:

- where the site currently ranks for anything
- how many people search for a term, or what they search instead
- who links to the site, or to competitors
- what competitors are doing

Those need Google Search Console (free, but the owner has to grant access) or a
paid data provider. Say this in the report's limits line. It is honest, and it
scopes the next conversation, which is where the ongoing work lives.

## Three tiers, and they are not close in value

**Tier 1, indexability. The site is invisible.** A `noindex` meta tag, an
`X-Robots-Tag: noindex` header, or `Disallow: /` in robots.txt. Any of these
means the page is not in Google at all, and will not be, no matter what else is
fixed. The status line belongs in this tier too: a page that answers 404, 403
or 500 is not indexed whatever it renders, and a page can look completely
normal in a browser while answering 500 to everything that reads the header.

These are `critical` regardless of what a scoring tool says, and they are
almost always a mistake rather than a decision: a staging configuration that
shipped, or a pre-launch block nobody removed.

This is the finding that pays for the audit. It is worth checking on every site
you look at, even casually, because when it is present it is the whole
conversation and it takes one line to fix.

**Tier 2, what a searcher sees.** Title, description, the heading that says
what the page is. These do not decide whether the page is found, but they decide
whether anyone clicks it. Rank them `low` to `medium` by how commercial the page
is: a missing title on the shop page matters more than on a privacy policy.

**Tier 3, hygiene.** Language attribute, heading order, image alternatives,
Open Graph tags. True, worth doing, rarely urgent. These belong in the hygiene
appendix rather than the body of the report. A client who sees ten `low`
findings in the main list stops reading before reaching the one that matters.

## Ranking SEO findings against everything else

The severities the script emits are provisional, exactly as in the other
collectors. Re-rank against SKILL.md §2, and note two things that regularly
change the answer:

- **A `noindex` on a page the owner deliberately hid is not a finding.** Check
  before reporting: admin areas, thank-you pages, and staging subdomains are
  meant to carry it. Reporting one of those as critical is a credibility loss
  you do not recover in the same meeting.
- **Thin content is a judgement, not a measurement.** The script flags it
  `unconfirmed` for a reason. A contact page with forty words is correct. A
  category page with forty words is the reason nothing ranks.

## What the script cannot see, and you should look at yourself

Five minutes of looking, after the collectors run:

- **Search for the business name in Google.** If the site does not come up
  first, something in tier 1 is wrong, or the site is too new. Either way that
  is the sentence the owner most wants answered.
- **Look at the titles as a set.** Individually fine, collectively repetitive
  ("Home | Shop | About — Store") is a template doing the writing.
- **Read the top of the shop or category page as a stranger.** If nothing says
  what is sold and where, no tag will rescue it.
- **Check the site works without JavaScript for the head tags.** A page whose
  title is set only after hydration is a page some crawlers index untitled. The
  collector waits briefly for this, so compare its `facts.titles` against
  `curl -s URL | grep -i '<title>'` when a site is client-rendered.

## Notes on the checks that surprise people

- **`alt=""` is correct** for decorative images and the script does not flag it.
  Only a missing attribute is reported. Do not let a tool that flags empty alt
  text talk you into "fixing" it.
- **A canonical pointing elsewhere is often deliberate**: a print view, a
  paginated set, a syndicated post. It is reported `unconfirmed`; verify before
  it goes in the report.
- **Canonicals can be declared in an HTTP header as well as the HTML**, and the
  two can disagree. The collector reads both and compares them, because a
  header canonical is invisible in "view source" and is the harder of the two
  to find by eye. When a conflict is reported, check the server or CDN config
  as well as the template.
- **Redirect chains are a performance finding as much as an SEO one.** Each hop
  is a round trip before anything renders, which on a phone on 4G is the part
  the owner can actually feel. Present it that way.
- **Link checking follows only same-origin links the pages publish**, capped by
  `--max-links` (default 30). It is not a crawler. What it finds also depends
  sharply on the URLs you give it: every input URL is already "seen", so
  passing a site's whole sitemap can leave almost nothing left to follow. If
  the link findings look thin, re-run against two or three pages rather than
  thirty.
- **Orphan pages are found by comparing the sitemap against the link graph**,
  since a page nothing links to cannot be reached by following links. The check
  only runs when at least half the sitemap was reachable from the pages
  audited. Below that the audit has not seen enough of the site to tell an
  orphan from a page it simply did not visit. It is always reported
  `unconfirmed`. Widen the URL list before believing it.
- **Duplicate content is matched exactly**, on a hash of the visible text, not
  by a similarity score. Two pages that merely read alike will not be flagged;
  two that are word-for-word identical will be.
