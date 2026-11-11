# Discogs Bulk Shopper

Local web app that ranks Discogs sellers by how many items from your wantlist you can get from each of them, for the lowest total price including shipping.

## Prerequisites

- Node 24
- Google Chrome (the marketplace is scraped through a real Chrome driven by [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright); a normal install in `/Applications` is found via `channel: 'chrome'` without any extra step. If Chrome fails to launch, run `npx patchright install chrome` once.)

## Setup

```sh
npm install
cp .env.example .env   # then fill in DISCOGS_USERNAME and DISCOGS_TOKEN
npm run dev            # http://localhost:5174
```

The Discogs token comes from discogs.com > Settings > Developers > personal access token. `.env` is git-ignored.

## Scripts

| Command         | What it does            |
| --------------- | ----------------------- |
| `npm run dev`   | Dev server on port 5174 |
| `npm run build` | Production build        |
| `npm test`      | Vitest unit tests       |
| `npm run lint`  | Prettier check + ESLint |
| `npm run check` | svelte-check (types)    |

## API

| Endpoint                     | Query params                                       | Returns                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/wantlist`          | `force=1` bypasses the 24-hour cache               | `{ items, fetchedAt, count }` as JSON                                                                                                                                                                                                                                                        |
| `GET /api/listings`          | `shipTo=DK` (default: the session's destination)   | `{ count, fetchedAt, shipTo, shipToName, loggedIn, stale }` for the snapshot of that destination, or `404 { error: 'no-listings' }` when nothing has been scraped for it yet; `500 { error: 'scrape', message }` when the session cannot be read                                             |
| `POST /api/listings`         | JSON body `{ force? }`                             | Starts a scrape for the session's current destination in the background: `202 { started: true }`, or `409 { error: 'already-running' }`                                                                                                                                                      |
| `GET /api/listings/progress` | –                                                  | Server-Sent Events: one `data: { status, progress, startedAt, finishedAt, error }` event per progress update and at least every 2 s, closing after `done`/`error`. With no job running, the last state is sent once                                                                          |
| `GET /api/session`           | `force=1` bypasses the 60-second cache             | `{ loggedIn, username, shipTo, checkedAt }`: whether the scraper's Chrome profile is logged in to Discogs and, if so, the buyer settings' country as `shipTo: { code, name }` (`null` when logged out); `500 { error: 'scrape', message }` when the pages cannot be read                     |
| `POST /api/session/login`    | –                                                  | Opens the Discogs login page in the Chrome window and waits (up to 5 min) for you to log in there, then returns the session state; `409 { error: 'already-running' }` while a login is open, `500 { error: 'scrape', message }` on timeout or with `SCRAPER_HEADLESS=1`                      |
| `POST /api/session/ship-to`  | –                                                  | Opens the Discogs buyer settings in the Chrome window so you can change the shipping country there, and returns the session state once you close the tab (or after 5 min); `409 { error: 'already-running' }` while it is open, `500 { error: 'scrape', message }` with `SCRAPER_HEADLESS=1` |
| `GET /api/rates`             | `base=DKK` (default `DEFAULT_CURRENCY`), `force=1` | `{ base, date, rates, fetchedAt }` from [frankfurter.app](https://www.frankfurter.app/) (ECB rates, 24-hour cache); `502 { error: 'rates' }` for a currency it does not know                                                                                                                 |

Listings are cached for 6 hours under `listings-<shipto>.json`, one file per destination. Discogs
quotes shipping for the shipping address of the logged-in account (geo-IP for a logged-out profile,
filed as `unknown`) and offers no way to set it per request, so the destination is read from the
session right before each scrape, see [docs/ship-to.md](docs/ship-to.md).

Errors are JSON too: a missing `.env` variable gives `500 { error: 'config', message }` and a failed Discogs call gives `502 { error: 'discogs', status, message }`. Responses are cached as JSON under `.cache/` (git-ignored; override the directory with `CACHE_DIR`).

## Scraping

Marketplace listings are not in the Discogs API, so they are scraped from the shop's GraphQL
endpoint through `discogs-marketplace-api-nodejs`, driving one Google Chrome window that stays open
for the lifetime of the dev server. Its user data lives in `profile/` (git-ignored): that is where
the Cloudflare clearance and Discogs cookies are kept, so delete the folder to start from a clean
profile. If Chrome refuses to start after a crash, the stale `profile/Singleton*` lock files are
removed automatically on the next launch.

Set `SCRAPER_HEADLESS=1` to hide the window; leave it unset while Cloudflare is being difficult, as
a visible Chrome is challenged less often. Exchange rates come from frankfurter.app, which covers the
major currencies (DKK, EUR, USD, GBP, SEK, NOK, JPY, CAD, AUD, CHF, PLN, CZK...) but not every
currency a Discogs seller can list in.

`npx tsx scripts/scrape-smoke.ts 249504 1180898` prints the session state with the destination it
detected, then scrapes a couple of releases end to end and prints three mapped listings, as a
quick check that Chrome and Cloudflare are cooperating.

### Logging in and choosing where sellers ship to

Shipping is quoted for the shipping address of the Discogs account once the profile is logged in,
so the workflow is:

1. **Log in once.** Run `npx tsx scripts/discogs-login.ts` (or `POST /api/session/login` from the
   running app): it opens the Discogs login page in the Chrome window and waits for you to log in
   there by hand, then prints whether it worked. The session cookies stay inside `profile/` and
   survive restarts.
2. **Change the ship-to country on Discogs** when you want quotes for another destination: the
   app's button (`POST /api/session/ship-to`) opens
   [discogs.com/settings/buyer](https://www.discogs.com/settings/buyer) in the Chrome window; pick
   the country in the shipping address, save, and close the tab. The app then re-reads the session
   (`GET /api/session` shows `shipTo: { code, name }`).
3. **Refresh the listings** (`POST /api/listings`): they are scraped for, and cached under, the
   destination the session reports.

The app never asks for, stores or transmits the Discogs password and never fills in or submits a
Discogs form; it only reads the site header and the selected country of the settings page. Both
steps need a visible window, so leave `SCRAPER_HEADLESS` unset. How the state is detected is
written up in [docs/ship-to.md](docs/ship-to.md).

## Stack

SvelteKit (Svelte 5 runes), SCSS design system in `src/lib/styles/` (tokens are injected into every component style via Vite; `main.scss` is imported once in the root layout), light/dark theme from `prefers-color-scheme`.
