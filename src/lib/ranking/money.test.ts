import { describe, expect, it } from 'vitest';
import { rates } from './__fixtures__/scenario';
import { convertMoney, round2 } from './money';
import { RankingError } from './types';

describe('convertMoney', () => {
  it('returns the same amount for the same currency, upper-casing the code', () => {
    expect(convertMoney({ amount: 12.345, currency: 'dkk' }, 'DKK', rates)).toEqual({
      amount: 12.345,
      currency: 'DKK'
    });
  });

  it('converts from the base currency', () => {
    expect(convertMoney({ amount: 80, currency: 'DKK' }, 'EUR', rates)).toEqual({
      amount: 10,
      currency: 'EUR'
    });
  });

  it('converts to the base currency', () => {
    expect(convertMoney({ amount: 10, currency: 'EUR' }, 'DKK', rates)).toEqual({
      amount: 80,
      currency: 'DKK'
    });
  });

  it('crosses between two non-base currencies via the base, rounded to 2 decimals', () => {
    // 10 GBP = 100 DKK = 200 SEK; 7 GBP = 70 DKK = 8.75 EUR
    expect(convertMoney({ amount: 10, currency: 'GBP' }, 'SEK', rates).amount).toBe(200);
    expect(convertMoney({ amount: 7, currency: 'GBP' }, 'EUR', rates).amount).toBe(8.75);
    expect(convertMoney({ amount: 1, currency: 'SEK' }, 'EUR', rates).amount).toBe(0.06);
  });

  it('throws a RankingError for an unknown currency', () => {
    expect(() => convertMoney({ amount: 1, currency: 'USD' }, 'DKK', rates)).toThrow(RankingError);
    expect(() => convertMoney({ amount: 1, currency: 'DKK' }, 'USD', rates)).toThrowError(
      /No exchange rate for USD/
    );
    try {
      convertMoney({ amount: 1, currency: 'DKK' }, 'USD', rates);
    } catch (error) {
      expect((error as RankingError).code).toBe('unknown-currency');
    }
  });
});

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.005)).toBeCloseTo(1, 2);
    expect(round2(2.675)).toBeCloseTo(2.68, 1);
    expect(round2(10.129)).toBe(10.13);
  });
});
