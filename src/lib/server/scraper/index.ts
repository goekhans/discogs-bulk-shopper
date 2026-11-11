import type { Listing } from '#lib/domain/types.js';
import { isFresh, readSnapshot, writeSnapshot, type Snapshot } from '#lib/server/cache.js';
import { fetchListings, type FetchListingsDeps, type ScrapeProgress } from './listings';
import type { SessionState } from './session';

export { ScrapeError, fetchListings, mapItem, parseMoney } from './listings';
export type { ScrapeProgress } from './listings';

export const LISTINGS_TTL_MS = 6 * 60 * 60 * 1000;

/** The destination a snapshot is filed under when the session reports none (logged out). */
export const UNKNOWN_SHIP_TO = 'unknown';

/** What is stored under `listings-<shipTo>`. Never the username. */
export interface ListingsSnapshotData {
  listings: Listing[];
  /** ISO code of the buyer settings' country the shipping was quoted for, or 'unknown'. */
  shipTo: string;
  shipToName: string | null;
  /** Whether the Chrome profile was logged in to Discogs when the listings were scraped. */
  loggedIn: boolean;
}

export interface ListingsResult {
  listings: Listing[];
  fetchedAt: string;
  shipTo: string;
  shipToName: string | null;
  loggedIn: boolean;
  count: number;
}

export interface ListingsCache {
  read: (key: string) => Promise<Snapshot<ListingsSnapshotData> | null>;
  write: (key: string, data: ListingsSnapshotData) => Promise<Snapshot<ListingsSnapshotData>>;
}

export interface GetListingsOptions {
  force?: boolean;
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface GetListingsDeps {
  getWantlist: () => Promise<{ items: { releaseId: number }[] }>;
  /** The Discogs session of the scraper profile, read right before scraping. */
  getSession: () => Promise<Pick<SessionState, 'loggedIn' | 'shipTo'>>;
  fetchListings: typeof fetchListings;
  scraper: Partial<FetchListingsDeps>;
  cache: ListingsCache;
  now: () => number;
}

export function listingsCacheKey(shipTo: string): string {
  return `listings-${shipTo.trim().toLowerCase()}`;
}

const defaultDeps: GetListingsDeps = {
  getWantlist: async () => (await import('#lib/server/discogs/wantlist.js')).getWantlist(),
  getSession: async () => (await import('./session')).getSession(),
  fetchListings,
  scraper: {},
  cache: {
    read: (key) => readSnapshot<ListingsSnapshotData>(key),
    write: (key, data) => writeSnapshot(key, data)
  },
  now: Date.now
};

function toResult(snapshot: Snapshot<ListingsSnapshotData>): ListingsResult {
  return {
    listings: snapshot.data.listings,
    fetchedAt: snapshot.fetchedAt,
    shipTo: snapshot.data.shipTo,
    shipToName: snapshot.data.shipToName,
    loggedIn: snapshot.data.loggedIn,
    count: snapshot.data.listings.length
  };
}

/** Returns the cached listings snapshot whatever its age, or null when there is none. */
export async function readListingsSnapshot(
  shipTo: string,
  deps: Partial<Pick<GetListingsDeps, 'cache' | 'now'>> = {}
): Promise<(ListingsResult & { stale: boolean }) | null> {
  const cache = deps.cache ?? defaultDeps.cache;
  const now = deps.now ?? defaultDeps.now;
  const snapshot = await cache.read(listingsCacheKey(shipTo));
  if (!snapshot) return null;
  return { ...toResult(snapshot), stale: !isFresh(snapshot, LISTINGS_TTL_MS, now()) };
}

/**
 * Marketplace listings for every release on the wantlist, quoted for the ship-to country of the
 * profile's Discogs session and served from the 6h cache of that country unless `force` is set or
 * the snapshot is missing or stale. A failed scrape rejects without touching the cache.
 */
export async function getListings(
  { force = false, onProgress }: GetListingsOptions = {},
  deps: Partial<GetListingsDeps> = {}
): Promise<ListingsResult> {
  const d: GetListingsDeps = { ...defaultDeps, ...deps };
  const session = await d.getSession();
  const shipTo = session.shipTo?.code ?? UNKNOWN_SHIP_TO;
  const key = listingsCacheKey(shipTo);

  if (!force) {
    const cached = await d.cache.read(key);
    if (cached && isFresh(cached, LISTINGS_TTL_MS, d.now())) return toResult(cached);
  }

  const { items } = await d.getWantlist();
  const listings = await d.fetchListings(
    items.map((item) => item.releaseId),
    { onProgress },
    d.scraper
  );
  const snapshot = await d.cache.write(key, {
    listings,
    shipTo,
    shipToName: session.shipTo?.name ?? null,
    loggedIn: session.loggedIn
  });
  return toResult(snapshot);
}
