import type { Money } from '#lib/domain/types.js';
import { isFresh, readSnapshot, writeSnapshot, type Snapshot } from '#lib/server/cache.js';

export const RATES_TTL_MS = 24 * 60 * 60 * 1000;
export const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';

/**
 * Exchange rates of one base currency. Frankfurter (ECB data) covers ~30 currencies: DKK, EUR,
 * USD, GBP, SEK, NOK, JPY, CAD, AUD, CHF, PLN, CZK, HUF, NZD, ZAR, BRL, MXN... but not every
 * currency Discogs lists in; convert() throws a RatesError for an unknown one.
 */
export interface Rates {
  base: string;
  /** Date of the rates, YYYY-MM-DD. */
  date: string;
  rates: Record<string, number>;
}

export class RatesError extends Error {
  readonly currency: string | null;

  constructor(message: string, currency: string | null = null) {
    super(message);
    this.name = 'RatesError';
    this.currency = currency;
  }
}

export interface RatesCache {
  read: (key: string) => Promise<Snapshot<Rates> | null>;
  write: (key: string, data: Rates) => Promise<Snapshot<Rates>>;
}

export interface RatesDeps {
  fetch: typeof fetch;
  cache: RatesCache;
  now: () => number;
}

const defaultDeps: RatesDeps = {
  fetch: (...args) => fetch(...args),
  cache: {
    read: (key) => readSnapshot<Rates>(key),
    write: (key, data) => writeSnapshot(key, data)
  },
  now: Date.now
};

export function ratesCacheKey(base: string): string {
  return `rates-${base.trim().toLowerCase()}`;
}

/** Latest rates for a base currency, from the 24h cache or frankfurter.app. */
export async function getRates(
  base: string,
  { force = false }: { force?: boolean } = {},
  deps: Partial<RatesDeps> = {}
): Promise<Rates & { fetchedAt: string }> {
  const d: RatesDeps = { ...defaultDeps, ...deps };
  const code = base.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new RatesError(`Invalid currency code "${base}"`, base);
  const key = ratesCacheKey(code);

  if (!force) {
    const cached = await d.cache.read(key);
    if (cached && isFresh(cached, RATES_TTL_MS, d.now())) {
      return { ...cached.data, fetchedAt: cached.fetchedAt };
    }
  }

  const response = await d.fetch(`${FRANKFURTER_URL}?base=${encodeURIComponent(code)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new RatesError(
      `Rates for ${code} unavailable: frankfurter returned ${response.status}`,
      code
    );
  }
  const body = (await response.json()) as Partial<Rates>;
  if (typeof body.date !== 'string' || typeof body.rates !== 'object' || !body.rates) {
    throw new RatesError(`Rates for ${code} unavailable: unexpected response`, code);
  }
  const rates: Rates = { base: body.base ?? code, date: body.date, rates: body.rates };
  const snapshot = await d.cache.write(key, rates);
  return { ...rates, fetchedAt: snapshot.fetchedAt };
}

/** Converts between any two currencies the rates table knows, rounding to 2 decimals. */
export function convert(money: Money, to: string, rates: Rates): Money {
  const target = to.toUpperCase();
  const source = money.currency.toUpperCase();
  if (source === target) return { amount: money.amount, currency: target };

  const base = rates.base.toUpperCase();
  const rateOf = (currency: string): number => {
    if (currency === base) return 1;
    const rate = rates.rates[currency];
    if (typeof rate !== 'number' || !(rate > 0)) {
      throw new RatesError(`No exchange rate for ${currency} (base ${base})`, currency);
    }
    return rate;
  };

  const inBase = money.amount / rateOf(source);
  const amount = Math.round(inBase * rateOf(target) * 100) / 100;
  return { amount, currency: target };
}
