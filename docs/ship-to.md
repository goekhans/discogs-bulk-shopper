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

`getListings()` takes no destination. Right before scraping it reads the profile's Discogs session
(`getSession()`, below) and files the snapshot under the ISO code of the buyer settings' country
(`listings-dk.json`), recording `{ shipTo: 'DK', shipToName: 'Denmark', loggedIn: true }`; a
logged-out profile scrapes into `listings-unknown.json` with `shipTo: 'unknown'`. The snapshot
never holds the username. To shop for another country, change the shipping address on Discogs
(`openShipToSettings()` / `POST /api/session/ship-to` opens that page in the Chrome window) and
refresh the listings. If Discogs ever exposes a ship-to parameter, `fetchListings` is the one place
to add it.

## Session detection

Spiked 2026-11-11 in the scraper's logged-out Chrome profile against `https://www.discogs.com/`
and `https://www.discogs.com/login`. The app never asks for, stores or transmits the Discogs
password or any cookie value; only cookie names and the public header markup were inspected.

**Header signal.** The site header is server-rendered as a declarative shadow DOM:
`<div id="__header_root_astro" class="discogs-fragment" data-fragment="header">` holding a
`<template shadowrootmode="open">`, so everything below lives in `#__header_root_astro.shadowRoot`
(a plain `document.querySelector('a#log_in_link')` finds nothing). Inside it:

- `nav.hdr-user` (aria-label "User") holds the cart link (`a[href="/sell/cart"]`,
  `data-tracking="header-icon-anonymous-cart"`, `data-guest-cart`) and, logged out, the link
  `a#log_in_link.login-entry-button` with `data-tracking="header-signup-login"`, `aria-label`
  "Sign Up / Log In", `href` `https://www.discogs.com/login?prompt=login&return_to=…&source=header`.
- `nav.hdr-main` (aria-label "Main") holds the Explore / Shop / Sell / Community / Digs menus.

Logged out is therefore `a#log_in_link` present; logged in is the header present without it.
`src/lib/server/scraper/session.ts` reads this from the homepage.

**Logged-in header** (verified 2026-11-11 after the owner's manual login; username redacted as
`<name>`). The login link is gone and `nav.hdr-user` holds, in `div.hdr-user-items`, the icon
links `a[href="/my"]` (Dashboard), `a[href="/user/<name>/collection"]` (Collection),
`a[href="/mywantlist"]`, `a[href="/sell/cart"]` (now `data-tracking="header-icon-cart"` with
`data-cart-count`), `a[href="/messages"]` and the notifications button, followed by the account
menu `div[data-name="account"].dd-wrapper` with:

- `button[data-tracking="header-loggedIn-user-profile"]` whose `aria-label` is
  `Logged in as <name>`, holding `img.login-avatar[alt="<name>"]` (a Gravatar);
- `div.dd-content[role="menu"] > div.login-user-menu > header > a.login-username[href="/user/<name>"]`
  with the text `Hi, <name>` and `View my profile`; the `ul.dd-group` menus below are filled in
  client-side later.

There is no `data-username` attribute anywhere. The username is therefore taken from the path of
`a.login-username` (falling back to any `nav.hdr-user a[href*="/user/"]` link, whose first path
segment after `/user/` is the name) or from `img.login-avatar[alt]`, and is `null` when none
matches.

**Cookies when logged in** (names only) add `session` (always), `ck_username`, `dwndvc` and
`ppc_onboard_prompt`. None of them is read; `ck_username` is not used as a signal either, the
header is.

**Login page.** `https://www.discogs.com/login` redirects to the Auth0 universal login at
`https://login.discogs.com/u/login?state=…` (form fields `username`, `password`, hidden `state` and
`connection`; no Discogs header on that page), and lands back on `www.discogs.com` afterwards.
Protected URLs redirect there with the target in the Auth0 `state`.

**Cookies when logged out** (names only): on `www.discogs.com` `cf_clearance`, `__cf_bm`, `sid`,
`language2`, `OptanonConsent`, `msr_open_genre_sections`, `msr_open_filter_sections`; visiting the
login page adds `session`.

**Ship-to setting URL.** Logged out, `/settings/buyer`, `/settings/shipping` and `/settings/seller`
all redirect to the login page (so they exist behind it), while `/settings`, `/users/settings` and
`/settings/buyer/shipping` are 404. The footer and help links of the logged-out site do not point at
the buyer settings. Which of them holds the destination is settled below.

## Logged-in destination

Spiked 2026-11-11 in the scraper's logged-in Chrome profile. Nothing was typed into or submitted
on any Discogs form; only the rendered markup was read.

**Where it lives: `https://www.discogs.com/settings/buyer`** ("Marketplace Settings for Buyers").
The page has two forms:

- a small one posting to `/settings/buyer` with `select#curr` (the display currency, 14 options)
  and a Save button;
- `form#buyer-address-form` ("Shipping Address" / "Billing Address"), whose `action` is the API
  (`https://api.discogs.com/users/<name>/settings/buyer/address`), with `input[name=name]`,
  `phone`, `paypal_email`, **`select#country[name=country]`**, `address1`, `address2`, `city`,
  `state` (text, plus a `select#state-province` for provinces), `postal_code`, the
  `billing_same_as_shipping` checkbox and the matching `billing_*` fields, a `buyer_policy`
  checkbox and the "Save Address" button (`name="Action.Save"`). `name`, `country`, `address1`,
  `city`, `state`, `postal_code`, the billing fields and `buyer_policy` are `required`, and the
  page runs client-side address validation (`address_validation_ui`).

**The signal.** The selected option of `select#country` is the ship-to country, as a **country
name** (`<option value="Denmark">Denmark</option>`; 246 options plus the placeholder
`<option value="">Select your country</option>`). The option values are Discogs' own English names
(`Russian Federation`, `Czech Republic`, `Slovak Republic`, `Macedonia`, `Swaziland`, `Turkey`,
`Former USSR`, `Yugoslavia`...), not ISO codes, so `src/lib/server/scraper/countries.ts` maps them
to ISO 3166-1 alpha-2 (`countryCode('Denmark')` → `DK`; names without a current code, such as
`Former USSR`, yield `unknown` with the name kept). `readShipToSignal()` reads
`select#country option:checked` and `getSession()` visits the page right after the homepage when
the header says logged in; logged out the URL redirects to the Auth0 host and `shipTo` is `null`.

**How it is changed.** By picking another country in `select#country` and submitting the whole
shipping-address form ("Save Address"): the country is one required field of the address, and
the form wants a name, street, city, state/region and postal code that validate for that country.
It is therefore not a plain select-and-save, so the app never changes it; `openShipToSettings()`
only opens the page in the Chrome window for the owner to edit by hand and re-reads the session
once the tab is closed. For the same reason the before/after check of step 1c was **not run**: the
shipping values were only noted for the current destination (Denmark; see the smoke-run output in
the goal report), the setting was never touched and still reads `Denmark`.

**Not the destination.** `https://www.discogs.com/settings/shipping` is the seller's "Shipping
Policies" page ("Add a Denmark shipping policy", policies for Europe / Entire World); it has no
form or select for the buyer. The shop list page (`/shop/list?release=249504`) shows no "Ships to"
indicator or selector when logged in either: listing cards carry `.msr-listing-card-shipping`
("+ £11.00 shipping", "+ SEK 80.00 shipping") in the seller's currency, and the filters still only
offer "Ships From". No cookie name encodes the destination (the logged-in cookie names are listed
above), so it cannot be set via `context.addCookies` either.
