# badseo.dev, 13 September 2026

The two sections no generator can write. Both reports read this file, so they
are written once here rather than pasted into each by hand.

## Summary

We looked at 33 pages of badseo.dev on 13 September 2026, testing what each
page tells search engines about itself and what the site reveals to the public
internet. Four of those pages were also loaded for speed, once on a mid-range
Android phone over 4G and once on a desktop browser, three times each with an
empty cache.

**This site is broken on purpose.** It is a test fixture: each page is built to
fail one specific check, and the sitemap names them accordingly. What follows
should be read as confirmation that the checks fire, not as a list of accidents
to go and fix.

Two results still look unintended. The site answers on an unencrypted
connection without sending visitors to the secure one, which is a safety matter
rather than a search one and is a single rule at the hosting layer. And two
pages carry an instruction telling search engines not to list them. That is
correct here, but on a live site it is the most expensive thing that can be
wrong, and it is the first thing worth checking on any site.

Speed behaves the same way. The home page draws its main content in about a
second, while two others take the server the better part of two seconds just to
begin replying. Those two are named for that fault in the sitemap, so the
measurement is agreeing with the label rather than discovering anything.

In total: 2 critical, 5 high, 11 medium, 17 low and 1 informational item.
Nothing suggests the site has been attacked, and no passwords or keys were
found in the code it sends to visitors.

## Plan

**This week** the redirect from the unencrypted address to the secure one, and
the headers that belong with it. All of it is configuration at the hosting
layer, it is under an hour together, and it is the one group of findings here
that does not look deliberate.

**Next, if this site is ever meant to be found** the two pages that tell search
engines not to list them, and the page with no title. On a fixture these are
the point. On a live site they are the difference between appearing in search
and not, and each is a one-line change.

**Later, and only if it matters** the titles, descriptions, headings and image
alternatives in the hygiene appendix. All true, all worth doing on a real site,
none of it urgent. Here it is deliberate, so the honest recommendation is to
leave it exactly as it is.

**What we did not test** only the pages the site publishes in its own sitemap,
and only as an anonymous visitor, since there is no login here. Speed was
measured on four of the 33 pages rather than all of them, so the screenshots
and the timings cover those four. Two further limits come from where this audit
ran rather than from the site: the connection passed through an inspecting
proxy, so the certificate details the tools recorded were the proxy's rather
than the site's and have been removed; and the deliberately orphaned page was
reached only because the sitemap names it, which is the point of that page,
since nothing links to it and following links would never find it.
