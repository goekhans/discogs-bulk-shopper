import { describe, expect, it, vi } from 'vitest';
import {
  RATES_TTL_MS,
  RatesError,
  convert,
  getRates,
  ratesCacheKey,
  type Rates,
  type RatesCache
} from './rates';

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const rates: Rates = {
  base: 'DKK',
  date: '2026-11-10',
  rates: { EUR: 0.134, USD: 0.155, GBP: 0.117, JPY: 23.5 }
};

describe('convert', () => {
  it('returns the same amount for the same currency', () => {
    expect(convert({ amount: 10, currency: 'usd' }, 'USD', rates)).toEqual({
      amount: 10,
      currency: 'USD'
    });
  });

  it('converts from the base currency', () => {
    expect(convert({ amount: 100, currency: 'DKK' }, 'EUR', rates)).toEqual({
      amount: 13.4,
      currency: 'EUR'
    });
  });

  it('converts to the base currency, rounded to 2 decimals', () => {
    expect(convert({ amount: 12.34, currency: 'USD' }, 'DKK', rates)).toEqual({
      amount: 79.61,
      currency: 'DKK'
    });
  });

  it('converts between two non-base currencies', () => {
    expect(convert({ amount: 10, currency: 'GBP' }, 'USD', rates)).toEqual({
      amount: 13.25,
      currency: 'USD'
    });
  });

  it('throws a RatesError for an unknown currency', () => {
    expect(() => convert({ amount: 1, currency: 'XYZ' }, 'DKK', rates)).toThrow(RatesError);
    expect(() => convert({ amount: 1, currency: 'DKK' }, 'XYZ', rates)).toThrow(/XYZ/);
  });
});

describe('getRates', () => {
  function memoryCache(initial?: { fetchedAt: string; data: Rates }) {
    const store = new Map<string, { fetchedAt: string; data: Rates }>();
    if (initial) store.set('rates-dkk', initial);
    const cache: RatesCache = {
      read: vi.fn(async (key: string) => store.get(key) ?? null),
      write: vi.fn(async (key, data) => {
        const snapshot = { fetchedAt: new Date(NOW).toISOString(), data };
        store.set(key, snapshot);
        return snapshot;
      })
    };
    return { cache, store };
  }

  const okFetch = () =>
    vi.fn(
      async () => new Response(JSON.stringify(rates), { status: 200 })
    ) as unknown as typeof fetch;

  it('fetches frankfurter and caches under rates-<base>', async () => {
    const { cache, store } = memoryCache();
    const fetch = okFetch();

    const result = await getRates('dkk', {}, { fetch, cache, now: () => NOW });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.frankfurter.app/latest?base=DKK',
      expect.anything()
    );
    expect(result).toEqual({ ...rates, fetchedAt: new Date(NOW).toISOString() });
    expect(ratesCacheKey('DKK')).toBe('rates-dkk');
    expect(store.get('rates-dkk')?.data).toEqual(rates);
  });

  it('serves a fresh cache without fetching, and refetches a stale one', async () => {
    const fresh = memoryCache({
      fetchedAt: new Date(NOW - RATES_TTL_MS + 1000).toISOString(),
      data: rates
    });
    const fetch = okFetch();
    await getRates('DKK', {}, { fetch, cache: fresh.cache, now: () => NOW });
    expect(fetch).not.toHaveBeenCalled();

    const stale = memoryCache({
      fetchedAt: new Date(NOW - RATES_TTL_MS - 1000).toISOString(),
      data: rates
    });
    await getRates('DKK', {}, { fetch, cache: stale.cache, now: () => NOW });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws a RatesError for an unsupported currency and writes nothing', async () => {
    const { cache } = memoryCache();
    const fetch: typeof globalThis.fetch = vi.fn(
      async () => new Response('{"message":"not found"}', { status: 404 })
    );

    await expect(getRates('XYZ', {}, { fetch, cache })).rejects.toBeInstanceOf(RatesError);
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('rejects malformed currency codes before fetching', async () => {
    const fetch = okFetch();
    await expect(getRates('not-a-code', {}, { fetch })).rejects.toBeInstanceOf(RatesError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
