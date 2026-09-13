# Technical SEO, and what it is honest to claim

`scripts/check-seo.mjs` reads what a search engine reads: the head tags, the
heading outline, the indexability directives, and the links a page publishes.
It is passive in exactly the sense the rest of this skill means — it requests
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
scopes the next conversation — which is where the ongoing work lives.

## Three tiers, and they are not close in value

**Tier 1 — indexability. The site is invisible.** A `noindex` meta tag, an
`X-Robots-Tag: noindex` header, or `Disallow: /` in robots.txt. Any of these
means the page is not in Google at all, and will not be, no matter what else is
fixed. These are `critical` regardless of what a scoring tool says, and they are
almost always a mistake rather than a decision — a staging configuration that
shipped, a pre-launch block nobody removed.

This is the finding that pays for the audit. It is worth checking on every site
you look at, even casually, because when it is present it is the whole
conversation and it takes one line to fix.

**Tier 2 — what a searcher sees.** Title, description, the heading that says
what the page is. These do not decide whether the page is found, but they decide
whether anyone clicks it. Rank them `low` to `medium` by how commercial the page
is: a missing title on the shop page matters more than on a privacy policy.

**Tier 3 — hygiene.** Language attribute, heading order, image alternatives,
Open Graph tags. True, worth doing, rarely urgent. These belong in the hygiene
appendix rather than the body of the report — a client who sees ten `low`
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
  first, something in tier 1 is wrong — or the site is too new. Either way that
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
- **A canonical pointing elsewhere is often deliberate** — a print view, a
  paginated set, a syndicated post. It is reported `unconfirmed`; verify before
  it goes in the report.
- **Redirect chains are a performance finding as much as an SEO one.** Each hop
  is a round trip before anything renders, which on a phone on 4G is the part
  the owner can actually feel. Present it that way.
- **Link checking follows only same-origin links the pages publish**, capped by
  `--max-links` (default 30). It is not a crawler and will not find an orphan
  page — nothing linked from anywhere is, by definition, not reachable by
  following links. Finding those needs the sitemap or their repo.
