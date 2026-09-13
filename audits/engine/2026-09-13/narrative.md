## Summary

We measured five pages of engine.com.pk as an ordinary shopper's phone and
laptop would load them: the home page, two category pages, a product page and
the cart. Nothing suggests the site has been attacked or that customer data is
exposed, and the security settings Shopify gives you are switched on and working.
The problem is speed, and it is concentrated exactly where it costs you money.
The category pages are the slowest thing on the site for a first-time visitor:
on a good connection they take about four seconds to show their main content,
against about one and a half seconds for the home page and a product page, and
on a mid-range Android phone over a weak mobile signal that stretches to about
fourteen. Come back a second time and the same page returns in about one and a
half seconds, so the shop feels quick to anyone who has used it before and slow
to the new customer you paid to bring there. Those category pages are where a
shopper arriving from an ad or a search decides whether to keep going. The cause is not your photographs, which
are handled well: every page loads roughly 2.2 megabytes of code before it can
finish, and more than half of that is advertising and analytics tags rather than
anything belonging to the shop. We found four separate Google tracking
containers running side by side on a single page. Alongside that, your category
pages are missing the one piece of markup that tells Google what the page is
about, which is a plain fix and a quick one.

We recorded fourteen issues worth acting on. Three of them account for almost all
of the harm, and the first week's work is one afternoon of measurement and one
change to the tracking setup.

## Plan

**This week.** Audit the tracking tags and remove the duplicates. Four Google
containers, a Facebook pixel, a Snapchat pixel, an email bot and a separate
push-notification service are all loading on every page, and together they are
more than half the code a shopper's phone has to get through before the page
settles. Most shops running this many tags are running two or three they no
longer use. Work out which ones are still feeding a report somebody reads, then
delete the rest and consolidate what remains into a single container. This needs
no theme development and it is the single largest change available to you.

**Next.** Reduce what a category page has to build. Each one currently arrives
with a hundred products' worth of markup, about twenty-three thousand elements,
and a phone has to lay all of that out before it can show anything. Showing
fewer products per page, or trimming the markup each product card carries, is
theme work of a few days and it targets that gap directly.
In the same pass, give every category page a proper main heading. At the moment
the category name is marked up as the least important heading level available
and the pages have no main heading at all, which makes it harder for Google to
tell that your "Men" page is about men's clothing. That part is an afternoon.

**Later, if worth it.** Set a Referrer-Policy header and stop publishing the
original source of seven theme scripts, both of which are hygiene rather than
exposure. Move the floating WhatsApp button clear of the product card controls
it currently clips. Fix the empty cart page, which invites the shopper to "try
these collections" and then lists none. The cart page also shifts as it loads,
slightly past the point where Google counts it against you.

**What we did not test.** This was a passive audit of the public shop with no
access to your Shopify admin, your theme source or any logged-in page, so we
tested nothing behind a login, nothing in the checkout past the cart, and we did
not add an item to a cart or submit any form. We measured from a data centre
that happens to sit beside the server delivering your pages, which means the
server response times we recorded are better than what a shopper in Karachi
gets: the comparison between your pages is sound, the absolute figures are
generous. A run from a Pakistani connection, and a look at the theme source,
would sharpen the speed numbers and let us say which of the tracking tags are
safe to remove rather than which ones merely look redundant.
