import type { Grade, Listing, Money } from '#lib/domain/types.js';
import { parseGrade } from '#lib/domain/types.js';
import type { SearchParams, SearchResult } from 'discogs-marketplace-api-nodejs';
import type { BrowserContext } from 'patchright';

/** Most release IDs one Discogs search accepts. */
export const MAX_RELEASE_IDS_PER_SEARCH = 2000;
/** Largest page Discogs returns. */
export const PAGE_SIZE = 250;

export type SearchItem = SearchResult['items'][number];
export type SearchFn = (
  params: SearchParams,
  context?: BrowserContext
) => Promise<Pick<SearchResult, 'items' | 'total' | 'nextCursor' | 'urlGenerated'>>;

export interface ScrapeProgress {
  /** 1-based index of the chunk of release IDs being searched. */
  chunk: number;
  chunks: number;
  /** Pages fetched so far, across all chunks. */
  pagesDone: number;
  itemsSoFar: number;
  /** Total listings Discogs reports for the current chunk. */
  total: number;
}

export interface FetchListingsOptions {
  /** ISO 3166-1 alpha-2 country the buyer is in. See docs/ship-to.md: it cannot be enforced. */
  shipTo: string;
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface FetchListingsDeps {
  search: SearchFn;
  /** Resolved once per fetch; undefined lets the package launch its own browser. */
  context?: () => Promise<BrowserContext | undefined>;
}

/** Raised for a Cloudflare block or any other failure while scraping; carries the search URL. */
export class ScrapeError extends Error {
  readonly url: string | null;
  override readonly cause: unknown;

  constructor(message: string, url: string | null, cause?: unknown) {
    super(message);
    this.name = 'ScrapeError';
    this.url = url;
    this.cause = cause;
  }
}

const defaultDeps: FetchListingsDeps = {
  // Loaded lazily so importing this module never pulls patchright into tests.
  search: async (params, context) =>
    (await import('discogs-marketplace-api-nodejs')).DiscogsMarketplace.search(params, context),
  context: async () => (await import('./browser')).getBrowserContext()
};

/** Parses the package's "12.34 USD" price strings. */
export function parseMoney(text: string): Money {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s+([A-Z]{3})\s*$/.exec(text);
  if (!match) throw new Error(`Cannot parse money "${text}"`);
  return { amount: Number(match[1]), currency: match[2] };
}

/** "99.8%" -> 99.8; null or garbage -> null. */
export function parseScore(score: string | null | undefined): number | null {
  if (!score) return null;
  const value = Number.parseFloat(score);
  return Number.isFinite(value) ? value : null;
}

function requireGrade(text: string, listingId: number): Grade {
  const grade = parseGrade(text);
  if (!grade) throw new Error(`Listing ${listingId} has an unknown media condition "${text}"`);
  return grade;
}

/** Maps one scraped item to the domain Listing. */
export function mapItem(item: SearchItem): Listing {
  const listedAt =
    item.listedAt instanceof Date
      ? item.listedAt.toISOString()
      : item.listedAt
        ? new Date(item.listedAt).toISOString()
        : null;
  return {
    id: item.id,
    releaseId: item.release.id,
    sellerId: item.seller.id,
    sellerName: item.seller.name,
    sellerRating: parseScore(item.seller.score),
    sellerRatingCount: item.seller.notes ?? null,
    sellerCountry: item.country.code ?? '',
    price: parseMoney(item.price.base),
    shipping: item.price.shipping ? parseMoney(item.price.shipping) : null,
    mediaCondition: requireGrade(item.condition.media.full, item.id),
    sleeveCondition: parseGrade(item.condition.sleeve.full),
    url: item.url,
    listedAt
  };
}

export function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Scrapes every available listing of the given releases, cheapest first, following the cursor of
 * each chunk until Discogs reports no next page. Any failure rejects with a ScrapeError.
 */
export async function fetchListings(
  releaseIds: number[],
  { shipTo, onProgress }: FetchListingsOptions,
  deps: Partial<FetchListingsDeps> = {}
): Promise<Listing[]> {
  void shipTo; // Not enforceable, see docs/ship-to.md; kept in the signature for when it is.
  const d: FetchListingsDeps = { ...defaultDeps, ...deps };
  const unique = [...new Set(releaseIds)];
  const chunks = chunk(unique, MAX_RELEASE_IDS_PER_SEARCH);
  const byId = new Map<number, Listing>();
  let pagesDone = 0;
  let url: string | null = null;

  try {
    const context = d.context ? await d.context() : undefined;
    for (const [index, ids] of chunks.entries()) {
      let after: string | undefined;
      do {
        const params: SearchParams = {
          releaseIds: ids,
          limit: PAGE_SIZE,
          showUnavailable: false,
          withCommunityStats: false,
          sort: 'price,asc',
          after
        };
        const page = await d.search(params, context);
        url = page.urlGenerated;
        for (const item of page.items) {
          if (!item.isAvailable) continue;
          if (!byId.has(item.id)) byId.set(item.id, mapItem(item));
        }
        pagesDone += 1;
        onProgress?.({
          chunk: index + 1,
          chunks: chunks.length,
          pagesDone,
          itemsSoFar: byId.size,
          total: page.total
        });
        after = page.nextCursor ?? undefined;
      } while (after);
    }
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ScrapeError(`Scraping Discogs failed: ${message}`, url, err);
  }
  return [...byId.values()];
}
