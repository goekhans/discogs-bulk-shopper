import { describe, expect, it } from 'vitest';
import { listings, rates, wantlist } from './__fixtures__/scenario';
import { applySellerConstraints, groupBySeller } from './group';
import { DEFAULT_SEARCH_PARAMS } from './types';

describe('groupBySeller', () => {
  const groups = groupBySeller(listings, wantlist, rates, 'DKK');

  it('groups every seller with converted amounts and wantlist items attached', () => {
    expect([...groups.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    const two = groups.get(2)!;
    expect(two.sellerName).toBe('seller_two');
    expect(two.sellerCountry).toBe('Germany');
    const first = two.items.find((i) => i.listing.releaseId === 1)!;
    expect(first.price).toEqual({ amount: 80, currency: 'DKK' });
    expect(first.shipping).toEqual({ amount: 40, currency: 'DKK' });
    expect(first.wantlistItem?.title).toBe('Release 1');
  });

  it('keeps a null shipping as null after conversion', () => {
    const three = groups.get(3)!;
    expect(three.items.find((i) => i.listing.releaseId === 5)!.shipping).toBeNull();
  });

  it('picks one listing per release: lower price wins a landed-cost tie', () => {
    const one = groups.get(1)!;
    expect(one.items).toHaveLength(4);
    expect(one.items.find((i) => i.listing.releaseId === 3)!.listing.id).toBe(131);
  });

  it('picks the lower listing id when landed cost and price tie', () => {
    const one = groups.get(1)!;
    expect(one.items.find((i) => i.listing.releaseId === 4)!.listing.id).toBe(140);
  });

  it('picks the cheaper landed cost even when its price is higher', () => {
    const cheaperShipping = { ...listings[0], id: 111, price: { amount: 105, currency: 'DKK' } };
    cheaperShipping.shipping = { amount: 10, currency: 'DKK' };
    const picked = groupBySeller([...listings, cheaperShipping], wantlist, rates, 'DKK')
      .get(1)!
      .items.find((i) => i.listing.releaseId === 1)!;
    expect(picked.listing.id).toBe(111);
  });

  it('leaves wantlistItem null for a release not on the wantlist', () => {
    const stray = { ...listings[0], id: 999, releaseId: 42 };
    const item = groupBySeller([stray], wantlist, rates, 'DKK')
      .get(1)!
      .items.find((i) => i.listing.releaseId === 42)!;
    expect(item.wantlistItem).toBeNull();
  });
});

describe('applySellerConstraints', () => {
  const groups = groupBySeller(listings, wantlist, rates, 'DKK');

  it('drops sellers below minItems', () => {
    expect([...applySellerConstraints(groups, DEFAULT_SEARCH_PARAMS).keys()].sort()).toEqual([
      1, 2, 3, 4
    ]);
    expect([
      ...applySellerConstraints(groups, { ...DEFAULT_SEARCH_PARAMS, minItems: 5 }).keys()
    ]).toEqual([3]);
  });

  it('treats minItems below 1 as 1', () => {
    expect(applySellerConstraints(groups, { ...DEFAULT_SEARCH_PARAMS, minItems: 0 }).size).toBe(5);
  });

  it('drops sellers missing a required release', () => {
    const kept = applySellerConstraints(groups, {
      ...DEFAULT_SEARCH_PARAMS,
      requiredGroups: [[3]]
    });
    expect([...kept.keys()].sort()).toEqual([1, 3]);
    expect(
      applySellerConstraints(groups, { ...DEFAULT_SEARCH_PARAMS, requiredGroups: [[3], [5]] }).size
    ).toBe(1);
  });

  it('keeps a seller offering any one release of a group, and requires every group', () => {
    const anyOf = (requiredGroups: number[][]) =>
      [
        ...applySellerConstraints(groups, { ...DEFAULT_SEARCH_PARAMS, requiredGroups }).keys()
      ].sort();
    // Seller 3 offers 5, seller 4 offers 6: either release satisfies the group.
    expect(anyOf([[5, 6]])).toEqual([3, 4]);
    // Both groups must be satisfied: only seller 3 offers 3 and one of 5/6.
    expect(anyOf([[3], [5, 6]])).toEqual([3]);
    expect(anyOf([[42, 43]])).toEqual([]);
    // Empty groups do not constrain anything.
    expect(anyOf([[]])).toEqual([1, 2, 3, 4]);
  });
});
