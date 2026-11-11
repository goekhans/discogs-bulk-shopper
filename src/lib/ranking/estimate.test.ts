import { describe, expect, it } from 'vitest';
import { listings, rates, wantlist } from './__fixtures__/scenario';
import { cheapestAnywhere, estimateSellerTotal, savingsFor } from './estimate';
import { groupBySeller } from './group';
import type { ChosenItem } from './types';

const groups = groupBySeller(listings, wantlist, rates, 'DKK');
const byRelease = new Map<number, ChosenItem[]>();
for (const group of groups.values()) {
  for (const item of group.items) {
    byRelease.set(item.listing.releaseId, [...(byRelease.get(item.listing.releaseId) ?? []), item]);
  }
}
const cheapest = cheapestAnywhere(byRelease);

describe('estimateSellerTotal', () => {
  it('sums prices and adds the single highest shipping', () => {
    expect(estimateSellerTotal(groups.get(1)!.items)).toEqual({
      itemsTotal: 280,
      shippingEstimate: 50,
      shippingUnknown: false,
      total: 330
    });
  });

  it('counts null shipping as 0 and flags the estimate', () => {
    expect(estimateSellerTotal(groups.get(3)!.items)).toEqual({
      itemsTotal: 350,
      shippingEstimate: 40,
      shippingUnknown: true,
      total: 390
    });
    expect(
      estimateSellerTotal([{ price: { amount: 1.1, currency: 'DKK' }, shipping: null }])
    ).toEqual({ itemsTotal: 1.1, shippingEstimate: 0, shippingUnknown: true, total: 1.1 });
  });

  it('rounds to 2 decimals', () => {
    const items = [0.1, 0.2, 0.3].map((amount) => ({
      price: { amount, currency: 'DKK' },
      shipping: { amount: 0.07, currency: 'DKK' }
    }));
    expect(estimateSellerTotal(items)).toEqual({
      itemsTotal: 0.6,
      shippingEstimate: 0.07,
      shippingUnknown: false,
      total: 0.67
    });
  });
});

describe('cheapestAnywhere', () => {
  it('finds the minimum landed cost per release across all sellers', () => {
    expect([...cheapest.entries()].sort(([a], [b]) => a - b)).toEqual([
      [1, 120],
      [2, 100],
      [3, 100],
      [4, 90],
      [5, 30],
      [6, 50]
    ]);
  });
});

describe('savingsFor', () => {
  it('is the cheapest-anywhere sum minus the seller total', () => {
    expect(savingsFor(groups.get(1)!.items, cheapest)).toBe(80);
    expect(savingsFor(groups.get(2)!.items, cheapest)).toBe(40);
    expect(savingsFor(groups.get(3)!.items, cheapest)).toBe(50);
  });

  it('can be negative', () => {
    expect(savingsFor(groups.get(4)!.items, cheapest)).toBe(-120);
  });
});
