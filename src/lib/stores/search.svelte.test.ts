import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEARCH_PARAMS, type SellerResult } from '#lib/ranking/index.js';
import { SEARCH_STORAGE_KEY, SearchStore } from './search.svelte.js';

function seller(id: number): SellerResult {
  const money = { amount: 10, currency: 'DKK' };
  return {
    sellerId: id,
    sellerName: `seller_${id}`,
    sellerRating: null,
    sellerRatingCount: null,
    sellerCountry: 'Denmark',
    items: [],
    itemCount: 2,
    offeredCount: 2,
    itemsTotal: money,
    shippingEstimate: money,
    shippingUnknown: false,
    total: money,
    perItem: money,
    savings: money,
    currency: 'DKK'
  };
}

const dataStatus = {
  wantlistFetchedAt: '2026-11-11T07:00:00Z',
  wantlistCount: 6,
  wantlistStale: false,
  listingsFetchedAt: '2026-11-11T08:00:00Z',
  listingsCount: 16,
  listingsStale: false,
  shipTo: 'dk',
  shipToName: 'Denmark',
  loggedIn: true,
  ratesDate: '2026-11-10',
  currency: 'DKK'
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

/** A fetch that pages through `total` sellers according to the posted params. */
function pagedFetch(total: number) {
  const calls: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const params = JSON.parse(String(init?.body)) as { page: number; pageSize: number };
    calls.push(params);
    const start = (params.page - 1) * params.pageSize;
    const ids = Array.from({ length: total }, (_, i) => i + 1).slice(
      start,
      start + params.pageSize
    );
    return jsonResponse({
      results: ids.map(seller),
      total,
      page: params.page,
      pageSize: params.pageSize,
      dataStatus
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  };
}

describe('SearchStore', () => {
  it('starts from the defaults without storage', () => {
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage: null });
    expect(store.params).toEqual(DEFAULT_SEARCH_PARAMS);
    expect(store.status).toBe('idle');
    expect(store.hasMore).toBe(false);
  });

  it('searches from page 1, then loadMore appends the next page', async () => {
    const { fetch, calls } = pagedFetch(5);
    const store = new SearchStore({ fetch, storage: null });
    store.setParams({ pageSize: 2 });

    await store.search();
    expect(store.status).toBe('done');
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2]);
    expect(store.total).toBe(5);
    expect(store.hasMore).toBe(true);
    expect(store.dataStatus).toEqual(dataStatus);

    await store.loadMore();
    expect(store.params.page).toBe(2);
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2, 3, 4]);

    await store.loadMore();
    expect(store.params.page).toBe(3);
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2, 3, 4, 5]);
    expect(store.hasMore).toBe(false);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);

    // A new search goes back to page 1 and replaces the results.
    await store.search();
    expect(store.params.page).toBe(1);
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2]);
  });

  it('ignores loadMore when there is nothing more or a request is in flight', async () => {
    const { fetch, calls } = pagedFetch(2);
    const store = new SearchStore({ fetch, storage: null });
    await store.loadMore();
    expect(calls).toHaveLength(0);

    await store.search();
    expect(store.hasMore).toBe(false);
    await store.loadMore();
    expect(calls).toHaveLength(1);
    expect(store.params.page).toBe(1);
  });

  it('does not loadMore while a search is loading', async () => {
    const { fetch, calls } = pagedFetch(50);
    const store = new SearchStore({ fetch, storage: null });
    const pending = store.search();
    expect(store.status).toBe('loading');
    await store.loadMore();
    await pending;
    expect(calls).toHaveLength(1);
  });

  it('loadMore pages through the params of the last successful search', async () => {
    const { fetch, calls } = pagedFetch(5);
    const store = new SearchStore({ fetch, storage: null });
    store.setParams({ pageSize: 2, currency: 'DKK', ranking: 'bang-for-buck' });
    await store.search();

    store.setParams({ currency: 'EUR', ranking: 'savings', minItems: 4 });
    await store.loadMore();
    expect(calls[1]).toMatchObject({
      page: 2,
      pageSize: 2,
      currency: 'DKK',
      ranking: 'bang-for-buck',
      minItems: DEFAULT_SEARCH_PARAMS.minItems
    });
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2, 3, 4]);
    // The edited params are kept for the next search().
    expect(store.params).toMatchObject({ currency: 'EUR', ranking: 'savings', page: 2 });

    await store.search();
    expect(calls[2]).toMatchObject({ page: 1, currency: 'EUR', ranking: 'savings', minItems: 4 });
  });

  it('rolls the page back when loadMore fails and keeps the results', async () => {
    const { fetch } = pagedFetch(5);
    let fail = false;
    const flaky = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      fail ? jsonResponse({ error: 'discogs', status: 503 }, 502) : fetch(url, init)
    );
    const store = new SearchStore({
      fetch: flaky as unknown as typeof globalThis.fetch,
      storage: null
    });
    store.setParams({ pageSize: 2 });
    await store.search();

    fail = true;
    await store.loadMore();
    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('discogs');
    expect(store.params.page).toBe(1);
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2]);
    expect(store.hasMore).toBe(true);

    fail = false;
    await store.loadMore();
    expect(store.params.page).toBe(2);
    expect(store.results.map((r) => r.sellerId)).toEqual([1, 2, 3, 4]);
  });

  it('sets the no-listings error on 409', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'no-listings' }, 409));
    const store = new SearchStore({
      fetch: fetch as unknown as typeof globalThis.fetch,
      storage: null
    });
    await store.search();
    expect(store.status).toBe('error');
    expect(store.error?.code).toBe('no-listings');
    expect(store.results).toEqual([]);
  });

  it('keeps validation issues from a 400', async () => {
    const issues = { formErrors: [], fieldErrors: { page: ['Too small'] } };
    const fetch = vi.fn(async () => jsonResponse({ error: 'invalid-params', issues }, 400));
    const store = new SearchStore({
      fetch: fetch as unknown as typeof globalThis.fetch,
      storage: null
    });
    await store.search();
    expect(store.error).toEqual({
      code: 'invalid-params',
      message: 'The search parameters are invalid.',
      issues
    });
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const store = new SearchStore({
      fetch: fetch as unknown as typeof globalThis.fetch,
      storage: null
    });
    await store.search();
    expect(store.error).toEqual({ code: 'network', message: 'Failed to fetch' });
  });

  it('persists params except page and restores them', () => {
    const storage = memoryStorage();
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage });
    store.setParams({ currency: 'EUR', minItems: 3 });
    store.addRequired([7]);

    const saved = JSON.parse(storage.data.get(SEARCH_STORAGE_KEY)!);
    expect(saved).toEqual({
      ...DEFAULT_SEARCH_PARAMS,
      currency: 'EUR',
      minItems: 3,
      requiredGroups: [[7]],
      page: undefined
    });
    expect('page' in saved).toBe(false);

    const restored = new SearchStore({ fetch: pagedFetch(0).fetch, storage });
    expect(restored.params).toEqual({
      ...DEFAULT_SEARCH_PARAMS,
      currency: 'EUR',
      minItems: 3,
      requiredGroups: [[7]]
    });
  });

  it('falls back to defaults when the stored params are corrupt or invalid', () => {
    const corrupt = memoryStorage({ [SEARCH_STORAGE_KEY]: '{not json' });
    expect(new SearchStore({ fetch: pagedFetch(0).fetch, storage: corrupt }).params).toEqual(
      DEFAULT_SEARCH_PARAMS
    );
    const invalid = memoryStorage({ [SEARCH_STORAGE_KEY]: JSON.stringify({ ranking: 'nope' }) });
    expect(new SearchStore({ fetch: pagedFetch(0).fetch, storage: invalid }).params).toEqual(
      DEFAULT_SEARCH_PARAMS
    );
  });

  it('uses globalThis.localStorage when present', () => {
    const storage = memoryStorage({
      [SEARCH_STORAGE_KEY]: JSON.stringify({ ranking: 'savings' })
    });
    vi.stubGlobal('localStorage', storage);
    try {
      const store = new SearchStore({ fetch: pagedFetch(0).fetch });
      expect(store.params.ranking).toBe('savings');
      store.setParams({ ranking: 'most-items' });
      expect(JSON.parse(storage.data.get(SEARCH_STORAGE_KEY)!).ranking).toBe('most-items');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('persists maxTotal as a number or null and restores it', () => {
    const storage = memoryStorage();
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage });
    store.setParams({ maxTotal: 800 });
    expect(JSON.parse(storage.data.get(SEARCH_STORAGE_KEY)!).maxTotal).toBe(800);
    expect(new SearchStore({ fetch: pagedFetch(0).fetch, storage }).params.maxTotal).toBe(800);

    store.setParams({ maxTotal: null });
    expect(JSON.parse(storage.data.get(SEARCH_STORAGE_KEY)!).maxTotal).toBeNull();
    expect(new SearchStore({ fetch: pagedFetch(0).fetch, storage }).params.maxTotal).toBeNull();
  });

  it('restores params stored before maxTotal existed with no budget', () => {
    const storage = memoryStorage({
      [SEARCH_STORAGE_KEY]: JSON.stringify({ currency: 'EUR', minItems: 3 })
    });
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage });
    expect(store.params).toEqual({ ...DEFAULT_SEARCH_PARAMS, currency: 'EUR', minItems: 3 });
    expect(store.params.maxTotal).toBeNull();
  });

  it('restores params stored before groups existed with an empty requiredGroups', () => {
    const storage = memoryStorage({
      [SEARCH_STORAGE_KEY]: JSON.stringify({ requiredReleaseIds: [7], excludedReleaseIds: [8] })
    });
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage });
    expect(store.params).toEqual({ ...DEFAULT_SEARCH_PARAMS, excludedReleaseIds: [8] });
  });

  it('merges required ids into the any-of group of their master', () => {
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage: null });
    // Master A has pressings 10, 11, 12; master B has 20, 21.
    store.addRequired([10], [10, 11, 12]);
    store.addRequired([20, 21], [20, 21]);
    expect(store.params.requiredGroups).toEqual([[10], [20, 21]]);

    store.addRequired([12], [10, 11, 12]);
    store.addRequired([12], [10, 11, 12]);
    expect(store.params.requiredGroups).toEqual([
      [10, 12],
      [20, 21]
    ]);

    // Without the master's ids, a lone release starts its own group.
    store.addRequired([30]);
    expect(store.params.requiredGroups).toEqual([[10, 12], [20, 21], [30]]);
    store.addRequired([]);
    expect(store.params.requiredGroups).toEqual([[10, 12], [20, 21], [30]]);
  });

  it('removes required ids from every group and drops empty groups', () => {
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage: null });
    store.addRequired([10, 11], [10, 11, 12]);
    store.addRequired([20], [20, 21]);
    store.removeRequired([11, 20, 99]);
    expect(store.params.requiredGroups).toEqual([[10]]);
    store.removeRequired([10]);
    expect(store.params.requiredGroups).toEqual([]);
  });

  it('keeps required and excluded ids disjoint', () => {
    const store = new SearchStore({ fetch: pagedFetch(0).fetch, storage: null });
    store.addRequired([1]);
    store.addRequired([1]);
    store.addExcluded([2]);
    expect(store.params.requiredGroups).toEqual([[1]]);
    expect(store.params.excludedReleaseIds).toEqual([2]);

    store.addExcluded([1]);
    expect(store.params.requiredGroups).toEqual([]);
    expect(store.params.excludedReleaseIds).toEqual([2, 1]);

    store.addRequired([2, 3], [2, 3]);
    expect(store.params.requiredGroups).toEqual([[2, 3]]);
    expect(store.params.excludedReleaseIds).toEqual([1]);

    store.addExcluded([2, 2]);
    expect(store.params.requiredGroups).toEqual([[3]]);
    expect(store.params.excludedReleaseIds).toEqual([1, 2]);

    store.removeRequired([3]);
    store.removeExcluded([1, 2]);
    expect(store.params.requiredGroups).toEqual([]);
    expect(store.params.excludedReleaseIds).toEqual([]);
  });

  it('reset restores the defaults and clears the results', async () => {
    const storage = memoryStorage();
    const store = new SearchStore({ fetch: pagedFetch(3).fetch, storage });
    store.setParams({ currency: 'SEK' });
    await store.search();
    store.reset();
    expect(store.params).toEqual(DEFAULT_SEARCH_PARAMS);
    expect(store.results).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.status).toBe('idle');
    expect(store.dataStatus).toBeNull();
    expect(JSON.parse(storage.data.get(SEARCH_STORAGE_KEY)!).currency).toBe('DKK');
  });
});
