# Saam's Store, 13 September 2026

The two sections no generator can write. Both reports read this file, so they
are written once here rather than pasted into each by hand.

## Summary

We looked at five pages of Saam's Store on 13 September 2026: the home page,
the shop, a product page, the cart and the checkout. Each was loaded twice
over, once on a typical mid-range Android phone over a 4G connection and once
on a desktop browser at 1440 pixels wide, three times each with an empty
cache. We also read what each page tells search engines about itself, and what
the site reveals to the public internet.

The site is in good shape, and most of this report says so. Speed is
competitive, nothing shifts around as pages load, every image is described for
screen readers, every internal link works, and the security basics are set up
correctly. Most shops we look at cannot say that.

The clearest opportunity is in how the site describes itself to Google. Four
of the five pages, including the product page and the checkout, carry the
identical title "Saamj Store" and the identical one-line description. To a
search engine those pages look interchangeable, so they compete with each other
rather than each ranking for what it actually sells. The cart page also has no
main heading at all. Both are template changes rather than redesigns, and
together they are well under a day.

On a phone the checkout is the slowest page we measured, at 2.8 seconds before
the main content appears, just ahead of the cart at 2.7. That is worth knowing
because it is the last step before someone pays, though see the note below on
what we could and could not see there.

In total: 4 medium and 11 low-severity items, plus 2 observations. Nothing
suggests the site has been attacked, and no passwords or keys were found in the
code it sends to visitors.

## Plan

**This week** give each page its own title and description. The product page
inheriting the site-wide title is the highest-value fix available here, because
product pages are what people search for and at the moment Google cannot tell
one from another. Add a main heading to the cart while the template is already
open. Half a day, no design work, nothing a customer would see change.

**Next** the fonts. Three font files totalling 89 kB currently hide text while
they load, which is why the first moment of each page feels blank on a phone.
One line of CSS changes that, and it is the cheapest visible improvement on the
list.

**Worth doing, not urgent** the cart's load time on mobile, at 2.69 seconds the
one page outside Google's good range; the sharing tags that currently make
links posted to WhatsApp or Facebook appear as bare addresses; and the four
standard security headers that are not set. None of these is costing customers
today.

**What we did not test** only public pages, as an anonymous visitor with an
empty basket. That matters most at the checkout: with nothing in the cart it
shows "Your cart is empty" rather than a real order, so the 2.8 seconds we
measured is the lightest that page will ever be. A real checkout carrying items,
totals and a payment form will be slower, and we could not measure it without an
account. The signed-in parts of the site are untested for the same reason, and
that is where most of the code lives. We did not review the source code in this pass. On screen
sizes, we measured two: a 412 pixel phone and a 1440 pixel desktop. Tablets and
the widths in between were not measured, and the desktop figures assume a fast
connection, so they are a best case rather than a typical one. Two limits
come from where the audit ran rather than from the site: the connection passed
through an inspecting proxy, so the certificate details our tools recorded were
the proxy's and have been removed; and this machine's processor is shared,
which inflates one measure of script-blocking time. Findings of that kind were
set aside after measuring the same pages five times against byte-for-byte
identical JavaScript and watching the figure swing by a factor of two.
