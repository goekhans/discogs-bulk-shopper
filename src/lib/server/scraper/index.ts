import type { Listing } from '#lib/domain/types.js';
import { isFresh, readSnapshot, writeSnapshot, type Snapshot } from '#lib/server/cache.js';
import { fetchListings, type FetchListingsDeps, type ScrapeProgress } from './listings';

export { ScrapeError, fetchListings, mapItem, parseMoney } from './listings';
export type { ScrapeProgress } from './listings';

export const LISTINGS_TTL_MS = 6 * 60 * 60 * 1000;

/** What is stored under `listings-<shipTo>`. */
export interface ListingsSnapshotData {
  listings: Listing[];
  /** 'profile': shipping is quoted for the Chrome profile's location, see docs/ship-to.md. */
  shipTo: 'profile';
  requestedShipTo: string;
}

export interface ListingsResult {
  listings: Listing[];
  fetchedAt: string;
  shipTo: 'profile';
  requestedShipTo: string;
  count: number;
}

export interface ListingsCache {
  read: (key: string) => Promise<Snapshot<ListingsSnapshotData> | null>;
  write: (key: string, data: ListingsSnapshotData) => Promise<Snapshot<ListingsSnapshotData>>;
}

export interface GetListingsOptions {
  shipTo: string;
  force?: boolean;
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface GetListingsDeps {
  getWantlist: () => Promise<{ items: { releaseId: number }[] }>;
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
    requestedShipTo: snapshot.data.requestedShipTo,
    count: snapshot.data.listings.length
  };
}

/** Returns the cached listings snapshot whatever its age, or null when there is none. */
export async function readListingsSnapshot(
  shipTo: string,
  deps: Partial<Pick<GetListingsDeps, 'cache'>> = {}
): Promise<(ListingsResult & { stale: boolean }) | null> {
  const cache = deps.cache ?? defaultDeps.cache;
  const snapshot = await cache.read(listingsCacheKey(shipTo));
  if (!snapshot) return null;
  return { ...toResult(snapshot), stale: !isFresh(snapshot, LISTINGS_TTL_MS) };
}

/**
 * Marketplace listings for every release on the wantlist, served from the 6h cache unless `force`
 * is set or the snapshot is missing or stale. A failed scrape rejects without touching the cache.
 */
export async function getListings(
  { shipTo, force = false, onProgress }: GetListingsOptions,
  deps: Partial<GetListingsDeps> = {}
): Promise<ListingsResult> {
  const d: GetListingsDeps = { ...defaultDeps, ...deps };
  const key = listingsCacheKey(shipTo);

  if (!force) {
    const cached = await d.cache.read(key);
    if (cached && isFresh(cached, LISTINGS_TTL_MS, d.now())) return toResult(cached);
  }

  const { items } = await d.getWantlist();
  const listings = await d.fetchListings(
    items.map((item) => item.releaseId),
    { shipTo, onProgress },
    d.scraper
  );
  const snapshot = await d.cache.write(key, {
    listings,
    shipTo: 'profile',
    requestedShipTo: shipTo
  });
  return toResult(snapshot);
}
