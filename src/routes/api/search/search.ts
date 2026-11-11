import type { WantlistItem } from '#lib/domain/types.js';
import { RankingError, rankSellers, type SellerResult } from '#lib/ranking/index.js';
import {
  parseSearchRequest,
  type SearchDataStatus,
  type SearchRequestIssues
} from '#lib/ranking/schema.js';
import { readSnapshot } from '#lib/server/cache.js';
import { DiscogsApiError } from '#lib/server/discogs/api.js';
import { getWantlist, WANTLIST_CACHE_KEY } from '#lib/server/discogs/wantlist.js';
import { getRates, RatesError, type Rates } from '#lib/server/rates.js';
import { resolveListingsSnapshot, type ListingsSnapshot } from './snapshot';

export type { SearchDataStatus };

export interface SearchResponse {
  results: SellerResult[];
  total: number;
  page: number;
  pageSize: number;
  dataStatus: SearchDataStatus;
}

export type SearchErrorBody =
  | { error: 'invalid-json' }
  | { error: 'invalid-params'; issues: SearchRequestIssues }
  /** A RankingError: its code and message. */
  | { error: 'invalid-params' | 'unknown-currency'; message: string }
  | { error: 'config'; message: string }
  /** The message is generic on purpose: the API error names the wantlist path (username). */
  | { error: 'discogs'; status: number; message: string }
  | { error: 'no-listings' };

export type SearchOutcome =
  { status: 200; body: SearchResponse } | { status: 400 | 409 | 500 | 502; body: SearchErrorBody };

export interface SearchDeps {
  getWantlist: () => Promise<{ items: WantlistItem[]; fetchedAt: string }>;
  /** The wantlist cache whatever its age, used when Discogs is down. */
  readCachedWantlist: () => Promise<{ items: WantlistItem[]; fetchedAt: string } | null>;
  getRates: (currency: string) => Promise<Rates>;
  resolveSnapshot: (shipTo: string | null) => Promise<ListingsSnapshot | null>;
  rank: typeof rankSellers;
}

export const defaultSearchDeps: SearchDeps = {
  getWantlist: () => getWantlist(),
  readCachedWantlist: async () => {
    const cached = await readSnapshot<WantlistItem[]>(WANTLIST_CACHE_KEY);
    return cached ? { items: cached.data, fetchedAt: cached.fetchedAt } : null;
  },
  getRates: (currency) => getRates(currency),
  resolveSnapshot: (shipTo) => resolveListingsSnapshot(shipTo),
  rank: rankSellers
};

export const DISCOGS_DOWN_MESSAGE = 'Discogs could not be reached';

/** The env module cannot be imported in unit tests, so ConfigError is recognised by name. */
function isConfigError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'ConfigError';
}

/**
 * Validates the body, gathers the wantlist, rates and listings snapshot, and ranks the sellers.
 * Returns the HTTP status and body instead of throwing so the route handler stays thin.
 *
 * Body (every field optional, see searchRequestSchema): `requiredGroups: number[][]` any-of
 * sets of release ids a seller must cover one of each; `excludedReleaseIds: number[]`;
 * `minMediaGrade`, `minSleeveGrade`; `currency`; `ranking`; `minItems`; `maxTotal` (a per-seller
 * budget in `currency` for items plus shipping, or null for none); `page`; `pageSize`; `shipTo`.
 * Unknown keys, including the retired `requiredReleaseIds`, are a 400 invalid-params.
 */
export async function runSearch(
  body: unknown,
  deps: Partial<SearchDeps> = {}
): Promise<SearchOutcome> {
  const d: SearchDeps = { ...defaultSearchDeps, ...deps };

  const parsed = parseSearchRequest(body);
  if (!parsed.success) {
    return { status: 400, body: { error: 'invalid-params', issues: parsed.issues } };
  }
  const { params, shipTo } = parsed.data;

  let wantlist: { items: WantlistItem[]; fetchedAt: string };
  let wantlistStale = false;
  try {
    wantlist = await d.getWantlist();
  } catch (err) {
    if (isConfigError(err)) return { status: 500, body: { error: 'config', message: err.message } };
    if (!(err instanceof DiscogsApiError)) throw err;
    const cached = await d.readCachedWantlist();
    if (!cached) {
      return {
        status: 502,
        body: { error: 'discogs', status: err.status, message: DISCOGS_DOWN_MESSAGE }
      };
    }
    wantlist = cached;
    wantlistStale = true;
  }

  let rates: Rates;
  try {
    rates = await d.getRates(params.currency);
  } catch (err) {
    if (err instanceof RatesError) {
      return { status: 400, body: { error: 'unknown-currency', message: err.message } };
    }
    throw err;
  }

  const snapshot = await d.resolveSnapshot(shipTo);
  if (!snapshot) return { status: 409, body: { error: 'no-listings' } };

  try {
    const ranked = d.rank(wantlist.items, snapshot.listings, rates, params);
    return {
      status: 200,
      body: {
        ...ranked,
        dataStatus: {
          wantlistFetchedAt: wantlist.fetchedAt,
          wantlistCount: wantlist.items.length,
          wantlistStale,
          listingsFetchedAt: snapshot.fetchedAt,
          listingsCount: snapshot.count,
          listingsStale: snapshot.stale,
          shipTo: snapshot.shipTo,
          shipToName: snapshot.shipToName,
          loggedIn: snapshot.loggedIn,
          ratesDate: rates.date,
          currency: params.currency
        }
      }
    };
  } catch (err) {
    if (err instanceof RankingError) {
      return { status: 400, body: { error: err.code, message: err.message } };
    }
    throw err;
  }
}
