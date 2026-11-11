# Ship-to spike: what decides the "ships to" country of a marketplace search

Investigated 2026-11-11 against `discogs-marketplace-api-nodejs` 1.18.1 and the live
`https://www.discogs.com/shop/list?release=249504` page, in the scraper's own logged-out
Chrome profile.

## Findings

**The package.** `search()` does not render the HTML listing page. It opens
`https://www.discogs.com/robots.txt` to be on the Discogs origin and then calls the shop's
persisted GraphQL query `MarketplaceSearch` from inside the page (`dist/scrapers/marketplace.scraper.js`).
The query variables are `{ query, filter, sort, first, after }`; `filter` knows `shipsFrom`
(seller country), `currency` (listing currency) and the condition/price/year filters, but nothing
about the destination. `urlGenerated` is only a courtesy link to the same search on the site; it is
never requested. The shipping cost comes back from the server as `node.shipping.price`, so the
destination is decided server-side per session.

**The live site.** The page's own `MarketplaceSearch` request has exactly the same variables
(`{"filter":{"release":[249504]},"first":25,"sort":{...}}`), so the site does not pass a ship-to
either. The shop page for a logged-out visitor has no "ships to" selector (only a "Ships From"
filter). The only cookies set are `cf_clearance`, `__cf_bm`, `OptanonConsent` and two
`msr_open_*_sections` UI cookies; there is no `ship_to`/`currency` cookie and no ship-to key in
`localStorage`. The destination is inferred from the visitor's IP: with a Danish IP the price filter
defaults to DKK and every card shows "about DKK x + VAT", i.e. shipping to Denmark.
Logged-in users can change the country in their Discogs buyer settings, which is tied to the
account session, not to anything a request can carry.

## Conclusion

- Per request (URL/GraphQL variable): **not possible**.
- Per context (cookie via `context.addCookies`): **not possible** for a logged-out profile; no such cookie exists.
- What works: the destination is the geo-location of the machine running Chrome (plus a logged-in
  account's buyer setting, if you log in inside the `profile/` window).

## What is implemented

`getListings({ shipTo })` still takes the country the user asked for: it names the cache file
(`listings-dk.json`) and is reported as `requestedShipTo`. Because the adapter cannot enforce it, the
snapshot records `shipTo: 'profile'`, meaning "whatever the Chrome profile's location resolves to".
The UI should present it as such. If Discogs ever exposes a ship-to parameter, `fetchListings` is the
one place to add it.
