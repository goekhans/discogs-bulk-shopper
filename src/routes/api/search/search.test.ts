import { describe, expect, it, vi } from 'vitest';
import { listings, rates, wantlist } from '#lib/ranking/__fixtures__/scenario.js';
import { DEFAULT_SEARCH_PARAMS } from '#lib/ranking/types.js';
import { DiscogsApiError } from '#lib/server/discogs/api.js';
import { RatesError } from '#lib/server/rates.js';
import { runSearch, type SearchDeps } from './search';
import { resolveListingsSnapshot, type ListingsSnapshot } from './snapshot';

const snapshot: ListingsSnapshot = {
  listings,
  fetchedAt: '2026-11-11T08:00:00.000Z',
  shipTo: 'dk',
  shipToName: 'Denmark',
  loggedIn: true,
  count: listings.length,
  stale: false
};

function deps(overrides: Partial<SearchDeps> = {}): Partial<SearchDeps> {
  return {
    getWantlist: async () => ({ items: wantlist, fetchedAt: '2026-11-11T07:00:00.000Z' }),
    readCachedWantlist: async () => null,
    getRates: async (currency) => {
      if (currency !== 'DKK') throw new RatesError(`No rates for ${currency}`, currency);
      return { ...rates, date: '2026-11-10', fetchedAt: '2026-11-11T07:30:00.000Z' };
    },
    resolveSnapshot: async () => snapshot,
    ...overrides
  };
}

describe('runSearch', () => {
  it('ranks sellers and reports the data status', async () => {
    const outcome = await runSearch({ pageSize: 2 }, deps());
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.results.map((r) => r.sellerName)).toEqual(['seller_three', 'seller_one']);
    expect(outcome.body.total).toBe(4);
    expect(outcome.body.page).toBe(1);
    expect(outcome.body.pageSize).toBe(2);
    expect(outcome.body.dataStatus).toEqual({
      wantlistFetchedAt: '2026-11-11T07:00:00.000Z',
      wantlistCount: 6,
      wantlistStale: false,
      listingsFetchedAt: snapshot.fetchedAt,
      listingsCount: listings.length,
      listingsStale: false,
      shipTo: 'dk',
      shipToName: 'Denmark',
      loggedIn: true,
      ratesDate: '2026-11-10',
      currency: 'DKK'
    });
  });

  it('passes the requested shipTo to the snapshot resolver, lowercased', async () => {
    const resolveSnapshot = vi.fn(async () => snapshot);
    await runSearch({ shipTo: 'DK' }, deps({ resolveSnapshot }));
    expect(resolveSnapshot).toHaveBeenCalledWith('dk');
    await runSearch({}, deps({ resolveSnapshot }));
    expect(resolveSnapshot).toHaveBeenLastCalledWith(null);
  });

  it('returns 409 no-listings without a snapshot', async () => {
    const outcome = await runSearch({}, deps({ resolveSnapshot: async () => null }));
    expect(outcome).toEqual({ status: 409, body: { error: 'no-listings' } });
  });

  it('returns 400 invalid-params with issues', async () => {
    const outcome = await runSearch({ ranking: 'bogus', page: 0 }, deps());
    expect(outcome.status).toBe(400);
    if (outcome.status !== 400 || !('issues' in outcome.body)) {
      throw new Error('expected invalid-params with issues');
    }
    expect(outcome.body.error).toBe('invalid-params');
    expect(Object.keys(outcome.body.issues.fieldErrors).sort()).toEqual(['page', 'ranking']);
  });

  it('rejects the retired requiredReleaseIds key with 400 invalid-params', async () => {
    const outcome = await runSearch({ requiredReleaseIds: [1] }, deps());
    expect(outcome.status).toBe(400);
    if (outcome.status !== 400 || !('issues' in outcome.body)) {
      throw new Error('expected invalid-params with issues');
    }
    expect(outcome.body.error).toBe('invalid-params');
    expect(outcome.body.issues.formErrors.join(' ')).toContain('requiredReleaseIds');
  });

  it('passes requiredGroups through to the ranking', async () => {
    const rank = vi.fn(() => ({ results: [], total: 0, page: 1, pageSize: 10 }));
    await runSearch({ requiredGroups: [[1, 2], [3]] }, deps({ rank }));
    expect(rank).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ requiredGroups: [[1, 2], [3]] })
    );
  });

  it('passes maxTotal through to the ranking', async () => {
    const rank = vi.fn(() => ({ results: [], total: 0, page: 1, pageSize: 10 }));
    await runSearch({ maxTotal: 800 }, deps({ rank }));
    expect(rank).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxTotal: 800 })
    );
  });

  it('ranks within the budget, reporting the untrimmed count per seller', async () => {
    const outcome = await runSearch({ maxTotal: 200, ranking: 'most-items' }, deps());
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.results.map((r) => [r.sellerName, r.itemCount, r.offeredCount])).toEqual([
      ['seller_three', 3, 5],
      ['seller_one', 2, 4],
      ['seller_two', 2, 2],
      ['seller_four', 2, 2]
    ]);
    expect(outcome.body.results.every((r) => r.total.amount <= 200)).toBe(true);
  });

  it('rejects a non-positive maxTotal with 400 invalid-params', async () => {
    const outcome = await runSearch({ maxTotal: -1 }, deps());
    expect(outcome.status).toBe(400);
    if (outcome.status !== 400 || !('issues' in outcome.body)) {
      throw new Error('expected invalid-params with issues');
    }
    expect(outcome.body.error).toBe('invalid-params');
    expect(Object.keys(outcome.body.issues.fieldErrors)).toEqual(['maxTotal']);
  });

  it('returns 400 unknown-currency when the rates lookup fails', async () => {
    const outcome = await runSearch({ currency: 'xyz' }, deps());
    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: 'unknown-currency' });
  });

  it('maps a missing token to 500 config', async () => {
    const err = new Error('Missing DISCOGS_TOKEN in .env');
    err.name = 'ConfigError';
    const outcome = await runSearch({}, deps({ getWantlist: () => Promise.reject(err) }));
    expect(outcome).toEqual({ status: 500, body: { error: 'config', message: err.message } });
  });

  it('falls back to the expired wantlist cache when Discogs fails, else 502', async () => {
    const fail = () => Promise.reject(new DiscogsApiError(503, '/users/x/wants'));
    const down = await runSearch({}, deps({ getWantlist: fail }));
    expect(down).toEqual({
      status: 502,
      body: { error: 'discogs', status: 503, message: 'Discogs could not be reached' }
    });
    expect(JSON.stringify(down.body)).not.toMatch(/users|wants|\//);

    const cached = await runSearch(
      {},
      deps({
        getWantlist: fail,
        readCachedWantlist: async () => ({ items: wantlist, fetchedAt: '2026-11-01T00:00:00Z' })
      })
    );
    expect(cached.status).toBe(200);
    if (cached.status !== 200) return;
    expect(cached.body.dataStatus.wantlistStale).toBe(true);
    expect(cached.body.dataStatus.wantlistFetchedAt).toBe('2026-11-01T00:00:00Z');
  });

  it('applies the default params', async () => {
    const rank = vi.fn(() => ({ results: [], total: 0, page: 1, pageSize: 10 }));
    await runSearch({}, deps({ rank }));
    expect(rank).toHaveBeenCalledWith(wantlist, listings, expect.anything(), DEFAULT_SEARCH_PARAMS);
  });
});

describe('resolveListingsSnapshot', () => {
  const at = (code: string, fetchedAt: string): ListingsSnapshot => ({
    ...snapshot,
    shipTo: code,
    fetchedAt
  });
  const store: Record<string, ListingsSnapshot> = {
    dk: at('dk', '2026-11-10T00:00:00Z'),
    de: at('de', '2026-11-11T00:00:00Z'),
    unknown: at('unknown', '2026-11-09T00:00:00Z')
  };
  const read = async (code: string) => store[code] ?? null;
  const codes = async () => Object.keys(store);

  it('reads the requested destination only', async () => {
    expect((await resolveListingsSnapshot('dk', { read, codes }))?.shipTo).toBe('dk');
    expect(await resolveListingsSnapshot('se', { read, codes })).toBeNull();
  });

  it('picks the most recently fetched snapshot without a destination', async () => {
    expect((await resolveListingsSnapshot(null, { read, codes }))?.shipTo).toBe('de');
    expect(await resolveListingsSnapshot(null, { read, codes: async () => [] })).toBeNull();
  });
});
