import { describe, expect, it } from 'vitest';
import type { Listing } from '#lib/domain/types.js';
import { applyBudget } from './budget';
import { estimateSellerTotal } from './estimate';
import type { SellerGroup } from './group';
import { DEFAULT_SEARCH_PARAMS, type ChosenItem } from './types';

/** A converted item in DKK; `id` defaults to the release id so each release is one listing. */
function item(
  releaseId: number,
  price: number,
  shipping: number | null,
  id = releaseId
): ChosenItem {
  const listing = {
    id,
    releaseId,
    sellerId: 1,
    sellerName: 'seller_one',
    price: { amount: price, currency: 'DKK' },
    shipping: shipping === null ? null : { amount: shipping, currency: 'DKK' }
  } as Listing;
  return {
    listing,
    wantlistItem: null,
    price: { amount: price, currency: 'DKK' },
    shipping: shipping === null ? null : { amount: shipping, currency: 'DKK' }
  };
}

function group(items: ChosenItem[], sellerId = 1): SellerGroup {
  return {
    sellerId,
    sellerName: `seller_${sellerId}`,
    sellerRating: null,
    sellerRatingCount: null,
    sellerCountry: 'Denmark',
    items,
    offeredCount: items.length
  };
}

const groupsOf = (...groups: SellerGroup[]) => new Map(groups.map((g) => [g.sellerId, g]));
const budget = (
  groups: Map<number, SellerGroup>,
  maxTotal: number | null,
  requiredGroups: number[][] = []
) => applyBudget(groups, { ...DEFAULT_SEARCH_PARAMS, maxTotal, requiredGroups });
const releases = (g: SellerGroup | undefined) => g?.items.map((i) => i.listing.releaseId);

describe('applyBudget', () => {
  it('returns the input map unchanged without a budget', () => {
    const groups = groupsOf(group([item(1, 100, 10)]));
    expect(budget(groups, null)).toBe(groups);
  });

  it('keeps every item when the whole order fits', () => {
    const groups = groupsOf(group([item(1, 100, 10), item(2, 50, 20)]));
    const kept = budget(groups, 170).get(1)!;
    expect(releases(kept)).toEqual([1, 2]);
    expect(kept.offeredCount).toBe(2);
    expect(estimateSellerTotal(kept.items).total).toBe(170);
  });

  it('fills cheapest price first and records the untrimmed count', () => {
    const groups = groupsOf(
      group([item(1, 90, 10), item(2, 20, 10), item(3, 40, 10), item(4, 30, 10)])
    );
    const kept = budget(groups, 100).get(1)!;
    // 20 + 30 + 40 + 10 shipping = 100 fits; 90 does not.
    expect(releases(kept)).toEqual([2, 3, 4]);
    expect(kept.offeredCount).toBe(4);
  });

  it('keeps the original item order among the picks', () => {
    const groups = groupsOf(group([item(1, 30, 0), item(2, 10, 0), item(3, 20, 0)]));
    expect(releases(budget(groups, 60).get(1))).toEqual([1, 2, 3]);
  });

  it('re-evaluates the highest shipping for each candidate', () => {
    // 10 + 10 = 20 with 5 shipping = 25; adding the 12 with 30 shipping would be 62 > 50.
    const groups = groupsOf(
      group([item(1, 10, 5), item(2, 10, 5), item(3, 12, 30), item(4, 20, 5)])
    );
    expect(releases(budget(groups, 50).get(1))).toEqual([1, 2, 4]);
  });

  it('skips an item that does not fit and keeps scanning', () => {
    // 10, then 20 (total 30), 25 would reach 55 > 50 but 20 with id 4 still fits.
    const groups = groupsOf(
      group([item(1, 10, 0), item(2, 20, 0), item(3, 25, 0), item(4, 20, 0)])
    );
    expect(releases(budget(groups, 50).get(1))).toEqual([1, 2, 4]);
  });

  it('breaks price ties by lower shipping, then lower listing id', () => {
    const groups = groupsOf(
      group([item(1, 10, 20, 11), item(2, 10, 5, 12), item(3, 10, 5, 10), item(4, 10, null, 13)])
    );
    // Order scanned: 4 (null as 0), 3 (id 10), 2 (id 12), 1 (shipping 20). Budget fits three.
    expect(releases(budget(groups, 35).get(1))).toEqual([2, 3, 4]);
  });

  it('seeds the picks with the cheapest landed item of every required group', () => {
    const groups = groupsOf(
      group([item(1, 60, 10), item(2, 55, 20), item(3, 5, 0), item(4, 6, 0)])
    );
    // Release 1 (landed 70) beats release 2 (landed 75) for the group; 60 + 5 + 10 = 75 fits, 6 not.
    const kept = budget(groups, 75, [[1, 2]]).get(1)!;
    expect(releases(kept)).toEqual([1, 3]);
  });

  it('keeps a required item that would never be picked cheapest-first', () => {
    const groups = groupsOf(group([item(1, 80, 10), item(2, 5, 10), item(3, 5, 10)]));
    expect(releases(budget(groups, 100, [[1]]).get(1))).toEqual([1, 2, 3]);
    expect(releases(budget(groups, 95, [[1]]).get(1))).toEqual([1, 2]);
  });

  it('drops a seller whose required picks alone exceed the budget', () => {
    const groups = groupsOf(
      group([item(1, 80, 10), item(2, 5, 10)], 1),
      group([item(1, 30, 10), item(2, 5, 10)], 2)
    );
    const kept = budget(groups, 60, [[1]]);
    expect([...kept.keys()]).toEqual([2]);
  });

  it('leaves a seller missing a required group for applySellerConstraints', () => {
    const groups = groupsOf(group([item(2, 5, 10), item(3, 5, 10)]));
    expect(releases(budget(groups, 60, [[1]]).get(1))).toEqual([2, 3]);
  });

  it('does not count a release twice when it satisfies two required groups', () => {
    const groups = groupsOf(group([item(1, 40, 10), item(2, 5, 10)]));
    const kept = budget(groups, 55, [[1], [1, 2]]).get(1)!;
    expect(releases(kept)).toEqual([1, 2]);
  });

  it('counts unknown shipping as 0', () => {
    const groups = groupsOf(group([item(1, 50, null), item(2, 50, null)]));
    expect(releases(budget(groups, 100).get(1))).toEqual([1, 2]);
    expect(releases(budget(groups, 99).get(1))).toEqual([1]);
  });

  it('rounds the way estimateSellerTotal does', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point; the budget compares the rounded sum.
    const groups = groupsOf(group([item(1, 0.1, 0), item(2, 0.2, 0)]));
    expect(releases(budget(groups, 0.3).get(1))).toEqual([1, 2]);
  });

  it('keeps a seller with no items within budget as an empty order', () => {
    const groups = groupsOf(group([item(1, 500, 0)]));
    const kept = budget(groups, 100).get(1)!;
    expect(kept.items).toEqual([]);
    expect(kept.offeredCount).toBe(1);
  });

  it('does not mutate the input groups', () => {
    const groups = groupsOf(group([item(1, 500, 0), item(2, 10, 0)]));
    budget(groups, 100);
    expect(groups.get(1)!.items).toHaveLength(2);
  });
});
