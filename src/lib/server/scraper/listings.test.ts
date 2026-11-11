import { describe, expect, it, vi } from 'vitest';
import type { Listing } from '#lib/domain/types.js';
import type { BrowserContext } from 'patchright';
import fixture from './__fixtures__/search-page.json';
import {
  MAX_RELEASE_IDS_PER_SEARCH,
  PAGE_SIZE,
  ScrapeError,
  fetchListings,
  mapItem,
  parseMoney,
  type SearchFn,
  type SearchItem
} from './listings';
import { getListings, listingsCacheKey, readListingsSnapshot, type ListingsCache } from './index';

type Page = Awaited<ReturnType<SearchFn>>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const items = () => clone(fixture.items) as unknown as SearchItem[];
const page = (overrides: Partial<Page> = {}): Page => ({ ...clone(fixture), ...overrides }) as Page;

describe('parseMoney', () => {
  it('parses the "12.34 USD" format', () => {
    expect(parseMoney('12.34 USD')).toEqual({ amount: 12.34, currency: 'USD' });
    expect(parseMoney('1500 JPY')).toEqual({ amount: 1500, currency: 'JPY' });
  });

  it('rejects anything else', () => {
    expect(() => parseMoney('USD 12')).toThrow(/Cannot parse money/);
    expect(() => parseMoney('')).toThrow();
  });
});

describe('mapItem', () => {
  it('maps a complete item', () => {
    expect(mapItem(items()[0])).toEqual<Listing>({
      id: 1001,
      releaseId: 249504,
      sellerId: 501,
      sellerName: 'seller_one',
      sellerRating: 99.8,
      sellerRatingCount: 1234,
      sellerCountry: 'US',
      price: { amount: 12.34, currency: 'USD' },
      shipping: { amount: 5.67, currency: 'USD' },
      mediaCondition: 'NM',
      sleeveCondition: 'VG+',
      url: 'https://example.test/shop/item/1001',
      listedAt: '2026-11-01T10:00:00.000Z'
    });
  });

  it('handles null shipping, score, notes, listedAt and a generic sleeve', () => {
    const listing = mapItem(items()[1]);
    expect(listing.shipping).toBeNull();
    expect(listing.sellerRating).toBeNull();
    expect(listing.sellerRatingCount).toBeNull();
    expect(listing.listedAt).toBeNull();
    expect(listing.sleeveCondition).toBeNull();
    expect(listing.mediaCondition).toBe('VG');
    expect(listing.price).toEqual({ amount: 80, currency: 'DKK' });
  });

  it('accepts a Date for listedAt, as the package returns', () => {
    const item = items()[0];
    item.listedAt = new Date('2026-05-05T05:05:05.000Z');
    expect(mapItem(item).listedAt).toBe('2026-05-05T05:05:05.000Z');
  });
});

describe('fetchListings', () => {
  it('searches with the fixed paging params and follows the cursor across pages', async () => {
    const [a, b, c] = items();
    c.isAvailable = true;
    const search = vi
      .fn<SearchFn>()
      .mockResolvedValueOnce(page({ items: [a], total: 3, nextCursor: 'c1' }))
      .mockResolvedValueOnce(page({ items: [b], total: 3, nextCursor: 'c2' }))
      .mockResolvedValueOnce(page({ items: [c], total: 3, nextCursor: null }));
    const onProgress = vi.fn();

    const listings = await fetchListings([249504, 1180898], { onProgress }, { search });

    expect(listings.map((l) => l.id)).toEqual([1001, 1002, 1003]);
    expect(search).toHaveBeenCalledTimes(3);
    expect(search.mock.calls[0][0]).toMatchObject({
      releaseIds: [249504, 1180898],
      limit: PAGE_SIZE,
      showUnavailable: false,
      withCommunityStats: false,
      sort: 'price,asc',
      after: undefined
    });
    expect(search.mock.calls[1][0].after).toBe('c1');
    expect(search.mock.calls[2][0].after).toBe('c2');
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      chunk: 1,
      chunks: 1,
      pagesDone: 1,
      itemsSoFar: 1,
      total: 3
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      chunk: 1,
      chunks: 1,
      pagesDone: 3,
      itemsSoFar: 3,
      total: 3
    });
  });

  it('splits release IDs into chunks of at most 2000 and reports the chunk', async () => {
    const ids = Array.from({ length: MAX_RELEASE_IDS_PER_SEARCH + 1 }, (_, i) => i + 1);
    const search = vi.fn<SearchFn>().mockResolvedValue(page({ items: [], nextCursor: null }));
    const onProgress = vi.fn();

    await fetchListings(ids, { onProgress }, { search });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[0][0].releaseIds).toHaveLength(MAX_RELEASE_IDS_PER_SEARCH);
    expect(search.mock.calls[1][0].releaseIds).toEqual([MAX_RELEASE_IDS_PER_SEARCH + 1]);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ chunk: 2, chunks: 2 }));
  });

  it('drops unavailable items and de-duplicates by listing id', async () => {
    const search = vi
      .fn<SearchFn>()
      .mockResolvedValueOnce(page({ nextCursor: 'c1' }))
      .mockResolvedValueOnce(page({ nextCursor: null }));

    const listings = await fetchListings([249504], {}, { search });

    expect(listings.map((l) => l.id)).toEqual([1001, 1002]);
  });

  it('passes the shared browser context to every search', async () => {
    const context = { fake: true } as unknown as BrowserContext;
    const search = vi.fn<SearchFn>().mockResolvedValue(page());
    await fetchListings([1], {}, { search, context: async () => context });
    expect(search.mock.calls[0][1]).toBe(context);
  });

  it('wraps failures in a ScrapeError carrying the search url', async () => {
    const cause = new Error('An error 403 occurred: blocked by Cloudflare (challenge, cf-ray x).');
    const search = vi
      .fn<SearchFn>()
      .mockResolvedValueOnce(page({ nextCursor: 'c1' }))
      .mockRejectedValueOnce(cause);

    const promise = fetchListings([249504], {}, { search });
    await expect(promise).rejects.toBeInstanceOf(ScrapeError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining('blocked by Cloudflare'),
      url: fixture.urlGenerated,
      cause
    });
  });
});

describe('getListings', () => {
  const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
  const wantlist = async () => ({ items: [{ releaseId: 249504 }, { releaseId: 1180898 }] });
  const loggedIn = async () => ({
    loggedIn: true,
    username: 'example_user',
    shipTo: { code: 'DK', name: 'Denmark' }
  });
  const loggedOut = async () => ({ loggedIn: false, username: null, shipTo: null });

  function memoryCache() {
    const store = new Map<string, Awaited<ReturnType<ListingsCache['read']>>>();
    const cache: ListingsCache = {
      read: vi.fn(async (key: string) => store.get(key) ?? null),
      write: vi.fn(async (key, data) => {
        const snapshot = { fetchedAt: new Date(NOW).toISOString(), data };
        store.set(key, snapshot);
        return snapshot;
      })
    };
    return { cache, store };
  }

  it('scrapes the wantlist releases and files the snapshot under the session destination', async () => {
    const { cache, store } = memoryCache();
    const search = vi.fn<SearchFn>().mockResolvedValue(page());
    const getSession = vi.fn(loggedIn);

    const result = await getListings(
      {},
      { cache, getWantlist: wantlist, getSession, scraper: { search }, now: () => NOW }
    );

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0].releaseIds).toEqual([249504, 1180898]);
    expect(result).toMatchObject({
      count: 2,
      shipTo: 'DK',
      shipToName: 'Denmark',
      loggedIn: true
    });
    expect(result.listings.map((l) => l.id)).toEqual([1001, 1002]);
    expect(listingsCacheKey('DK')).toBe('listings-dk');
    expect(store.get('listings-dk')?.data).toEqual({
      listings: result.listings,
      shipTo: 'DK',
      shipToName: 'Denmark',
      loggedIn: true
    });
    expect(JSON.stringify(store.get('listings-dk'))).not.toContain('example_user');
    expect(JSON.stringify(result)).not.toContain('example_user');
  });

  it('files a logged-out scrape under listings-unknown', async () => {
    const { cache, store } = memoryCache();
    const search = vi.fn<SearchFn>().mockResolvedValue(page());

    const result = await getListings(
      {},
      { cache, getWantlist: wantlist, getSession: loggedOut, scraper: { search }, now: () => NOW }
    );

    expect(result).toMatchObject({ shipTo: 'unknown', shipToName: null, loggedIn: false });
    expect(store.has('listings-unknown')).toBe(true);
    expect(await readListingsSnapshot('unknown', { cache })).toMatchObject({
      shipTo: 'unknown',
      stale: false
    });
  });

  it('serves a fresh snapshot without scraping and rescrapes a stale or forced one', async () => {
    const { cache, store } = memoryCache();
    const search = vi.fn<SearchFn>().mockResolvedValue(page());
    const deps = {
      cache,
      getWantlist: wantlist,
      getSession: loggedIn,
      scraper: { search },
      now: () => NOW
    };

    await getListings({}, deps);
    await getListings({}, deps);
    expect(search).toHaveBeenCalledTimes(1);

    await getListings({ force: true }, deps);
    expect(search).toHaveBeenCalledTimes(2);

    store.set('listings-dk', {
      ...store.get('listings-dk')!,
      fetchedAt: '2020-01-01T00:00:00.000Z'
    });
    await getListings({}, deps);
    expect(search).toHaveBeenCalledTimes(3);
  });

  it('keeps one snapshot per destination', async () => {
    const { cache, store } = memoryCache();
    const search = vi.fn<SearchFn>().mockResolvedValue(page());
    const sweden = async () => ({
      loggedIn: true,
      username: 'example_user',
      shipTo: { code: 'SE', name: 'Sweden' }
    });

    await getListings(
      {},
      { cache, getWantlist: wantlist, getSession: loggedIn, scraper: { search } }
    );
    await getListings(
      {},
      { cache, getWantlist: wantlist, getSession: sweden, scraper: { search } }
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect([...store.keys()]).toEqual(['listings-dk', 'listings-se']);
  });

  it('writes nothing to the cache when the scrape fails', async () => {
    const { cache, store } = memoryCache();
    const search = vi.fn<SearchFn>().mockRejectedValue(new Error('boom'));

    await expect(
      getListings({}, { cache, getWantlist: wantlist, getSession: loggedIn, scraper: { search } })
    ).rejects.toBeInstanceOf(ScrapeError);

    expect(cache.write).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });
});
