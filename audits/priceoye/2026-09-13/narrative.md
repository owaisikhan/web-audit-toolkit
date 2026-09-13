## Summary

We looked at PriceOye from the outside, the way any shopper's browser sees it:
the home page, two category listings, a product page, a comparison page and one
price-list page, tested on a laptop and on a mid-range Android phone over a
typical mobile connection. We did not log in and we did not test anything a
normal visitor could not reach.

The site is in good shape on the things that most often go wrong. It loads over
a secure connection, redirects insecure requests, sets the main protective
headers, keeps its sign-in cookies locked down, compresses what it sends, and
every page we checked is set up to be found in search. Nothing suggests the site
has been attacked or is leaking anything it should not.

The clearest problem is one page type: the price-list pages. The one we tested
takes three to four seconds just for the server to answer, and roughly twelve
seconds before its content is usable on a phone, while also showing phones that
were discontinued and last updated in 2023. The home page also jumps around as
it loads, which is untidy and costs a little in search ranking. The rest are
smaller, cheaper fixes: the sale page wears the home page's name in Google, two
of the most important page types are missing their main heading, and images are
sent at larger sizes than they are shown.

In total: two things worth doing soon, and a short list of quick wins that make
the site tidier and easier to find. None of it is an emergency.

## Plan

**This week.** Fix the price-list pages. Find out why the server takes three to
four seconds to answer them and bring that down to well under a second like the
rest of the site, and refresh their content so they stop listing discontinued
products. This is the slowest, stalest thing a shopper can land on. Then give
the sale page its own title and description so it stops appearing in Google as a
copy of the home page.

**Next.** Steady the home page as it loads by reserving space for images before
they arrive, so the page stops shifting under the reader. Add a single main
heading to the product and comparison pages. Serve images at the size they are
actually shown, in a modern format.

**Later, if worth it.** Add a Content-Security-Policy and a Referrer-Policy, tidy
the extra headings on the home page, shorten the few titles and descriptions
that are cut off in search results, and fix the one missing image on the
price-list page.

**What we did not test.** Anything behind the login, and the source code, which
we did not have. We tested six pages out of a very large catalogue, chosen as
the ones a shopper is most likely to move through, so treat the page-level
findings as representative of their page types rather than a list of every
affected URL.
