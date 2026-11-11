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

| Endpoint                     | Query params                                       | Returns                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/wantlist`          | `force=1` bypasses the 24-hour cache               | `{ items, fetchedAt, count }` as JSON                                                                                                                                                                               |
| `GET /api/listings`          | `shipTo=DK` (default `DEFAULT_SHIP_TO`)            | `{ count, fetchedAt, shipTo, requestedShipTo, stale }`, or `404 { error: 'no-listings' }` when nothing has been scraped for that country yet                                                                        |
| `POST /api/listings`         | JSON body `{ shipTo?, force? }`                    | Starts a scrape in the background: `202 { started: true }`, or `409 { error: 'already-running' }`                                                                                                                   |
| `GET /api/listings/progress` | –                                                  | Server-Sent Events: one `data: { status, progress, startedAt, finishedAt, error }` event per progress update and at least every 2 s, closing after `done`/`error`. With no job running, the last state is sent once |
| `GET /api/rates`             | `base=DKK` (default `DEFAULT_CURRENCY`), `force=1` | `{ base, date, rates, fetchedAt }` from [frankfurter.app](https://www.frankfurter.app/) (ECB rates, 24-hour cache); `502 { error: 'rates' }` for a currency it does not know                                        |

Listings are cached for 6 hours under `listings-<shipto>.json`. The `shipTo` of a snapshot is always
`'profile'`: Discogs quotes shipping for the location of the Chrome profile (geo-IP for a logged-out
profile) and offers no way to set it per request, see [docs/ship-to.md](docs/ship-to.md).

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

`npx tsx scripts/scrape-smoke.ts 249504 1180898` scrapes a couple of releases end to end and prints
three mapped listings, as a quick check that Chrome and Cloudflare are cooperating.

## Stack

SvelteKit (Svelte 5 runes), SCSS design system in `src/lib/styles/` (tokens are injected into every component style via Vite; `main.scss` is imported once in the root layout), light/dark theme from `prefers-color-scheme`.
