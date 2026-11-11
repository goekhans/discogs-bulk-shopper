# Discogs Bulk Shopper

Local web app that ranks Discogs sellers by how many items from your wantlist you can get from each of them, for the lowest total price including shipping.

## Prerequisites

- Node 24
- Google Chrome (used for scraping from goal 3 on; run `npx patchright install chrome` once you get there)

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

| Endpoint            | Query params                         | Returns                               |
| ------------------- | ------------------------------------ | ------------------------------------- |
| `GET /api/wantlist` | `force=1` bypasses the 24-hour cache | `{ items, fetchedAt, count }` as JSON |

Errors are JSON too: a missing `.env` variable gives `500 { error: 'config', message }` and a failed Discogs call gives `502 { error: 'discogs', status, message }`. Responses are cached as JSON under `.cache/` (git-ignored; override the directory with `CACHE_DIR`).

## Stack

SvelteKit (Svelte 5 runes), SCSS design system in `src/lib/styles/` (tokens are injected into every component style via Vite; `main.scss` is imported once in the root layout), light/dark theme from `prefers-color-scheme`.
