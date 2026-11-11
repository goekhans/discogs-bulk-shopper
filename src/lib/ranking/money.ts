import type { Money } from '#lib/domain/types.js';
import { RankingError, type RateTable } from './types.js';

export function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Pure counterpart of the server's convert(): same currency is returned unchanged (code
 * upper-cased), the base currency has rate 1, every other pair crosses via the base, and an
 * unknown currency throws a RankingError. Rounded to 2 decimals.
 */
export function convertMoney(money: Money, to: string, rates: RateTable): Money {
  const target = to.toUpperCase();
  const source = money.currency.toUpperCase();
  if (source === target) return { amount: money.amount, currency: target };

  const base = rates.base.toUpperCase();
  const rateOf = (currency: string): number => {
    if (currency === base) return 1;
    const rate = rates.rates[currency];
    if (typeof rate !== 'number' || !(rate > 0)) {
      throw new RankingError(`No exchange rate for ${currency} (base ${base})`, 'unknown-currency');
    }
    return rate;
  };

  const inBase = money.amount / rateOf(source);
  return { amount: round2(inBase * rateOf(target)), currency: target };
}

export function sumMoney(amounts: number[]): number {
  let sum = 0;
  for (const amount of amounts) sum += amount;
  return round2(sum);
}
