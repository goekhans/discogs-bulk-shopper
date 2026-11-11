import { describe, expect, it } from 'vitest';
import type { Listing } from '#lib/domain/types.js';
import { listings, rates, wantlist } from './__fixtures__/scenario';
import { rankSellers } from './rank';
import { DEFAULT_SEARCH_PARAMS, RankingError, type SearchParams } from './types';

const rank = (overrides: Partial<SearchParams> = {}, input: Listing[] = listings) =>
  rankSellers(wantlist, input, rates, { ...DEFAULT_SEARCH_PARAMS, ...overrides });
const names = (overrides: Partial<SearchParams> = {}) =>
  rank(overrides).results.map((r) => r.sellerName);

describe('rankSellers', () => {
  it('fills every result field in the requested currency', () => {
    const [three] = rank({ ranking: 'bang-for-buck' }).results;
    expect(three).toMatchObject({
      sellerId: 3,
      sellerName: 'seller_three',
      sellerCountry: 'United Kingdom',
      sellerRating: 99.5,
      sellerRatingCount: 1003,
      itemCount: 5,
      offeredCount: 5,
      itemsTotal: { amount: 350, currency: 'DKK' },
      shippingEstimate: { amount: 40, currency: 'DKK' },
      shippingUnknown: true,
      total: { amount: 390, currency: 'DKK' },
      perItem: { amount: 78, currency: 'DKK' },
      savings: { amount: 50, currency: 'DKK' },
      currency: 'DKK'
    });
    expect(three.items.map((i) => i.listing.releaseId).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(three.items[0].wantlistItem).not.toBeNull();
  });

  it('converts to another result currency', () => {
    const [two] = rank({ ranking: 'cheapest-total', currency: 'eur' }).results;
    expect(two.sellerName).toBe('seller_two');
    expect(two.total).toEqual({ amount: 22.5, currency: 'EUR' });
    expect(two.currency).toBe('EUR');
  });

  it('orders bang-for-buck by per-item price ascending', () => {
    expect(names({ ranking: 'bang-for-buck' })).toEqual([
      'seller_three',
      'seller_one',
      'seller_two',
      'seller_four'
    ]);
  });

  it('orders most-items by item count descending, then total ascending', () => {
    expect(names({ ranking: 'most-items' })).toEqual([
      'seller_three',
      'seller_one',
      'seller_two',
      'seller_four'
    ]);
    expect(rank({ ranking: 'most-items' }).results.map((r) => r.total.amount)).toEqual([
      390, 330, 180, 200
    ]);
  });

  it('orders cheapest-total by total ascending', () => {
    expect(names({ ranking: 'cheapest-total' })).toEqual([
      'seller_two',
      'seller_four',
      'seller_one',
      'seller_three'
    ]);
  });

  it('orders savings by savings descending', () => {
    const result = rank({ ranking: 'savings' }).results;
    expect(result.map((r) => r.sellerName)).toEqual([
      'seller_one',
      'seller_three',
      'seller_two',
      'seller_four'
    ]);
    expect(result.map((r) => r.savings.amount)).toEqual([80, 50, 40, -120]);
  });

  it('breaks bang-for-buck ties by item count, then seller name', () => {
    // Two sellers with identical per-item cost and item count differ only by name.
    const clone = (l: Listing, sellerId: number, sellerName: string): Listing => ({
      ...l,
      id: l.id + 1000 * sellerId,
      sellerId,
      sellerName
    });
    const twos = listings.filter((l) => l.sellerId === 2);
    const input = [
      ...listings,
      ...twos.map((l) => clone(l, 9, 'seller_zed')),
      ...twos.map((l) => clone(l, 8, 'seller_alpha'))
    ];
    const order = rank({ ranking: 'bang-for-buck' }, input).results.map((r) => r.sellerName);
    expect(order).toEqual([
      'seller_three',
      'seller_one',
      'seller_alpha',
      'seller_two',
      'seller_zed',
      'seller_four'
    ]);
  });

  it('drops sellers that lack a required release', () => {
    expect(names({ requiredGroups: [[3]] })).toEqual(['seller_three', 'seller_one']);
    expect(names({ requiredGroups: [[6]] })).toEqual(['seller_four']);
  });

  it('drops excluded releases from every seller', () => {
    const result = rank({ excludedReleaseIds: [1], ranking: 'most-items' });
    // seller_two is left with one item and falls under minItems.
    expect(result.results.map((r) => r.sellerName)).toEqual([
      'seller_three',
      'seller_one',
      'seller_four'
    ]);
    expect(result.results[0].itemCount).toBe(4);
    expect(result.results[1].total.amount).toBe(230);
  });

  it('applies media, sleeve and combined grade filters', () => {
    expect(names({ minMediaGrade: 'VG+', ranking: 'cheapest-total' })).toEqual([
      'seller_two',
      'seller_four',
      'seller_one'
    ]);
    expect(names({ minSleeveGrade: 'NM', ranking: 'cheapest-total' })).toEqual([
      'seller_two',
      'seller_four'
    ]);
    expect(names({ minMediaGrade: 'NM', minSleeveGrade: 'M' })).toEqual(['seller_four']);
  });

  it('fails a null sleeve grade against any sleeve filter but not against none', () => {
    expect(names({ minSleeveGrade: 'P' })).not.toContain('seller_three');
    expect(names({ minSleeveGrade: null })).toContain('seller_three');
  });

  it('honours minItems', () => {
    expect(names({ minItems: 1, ranking: 'cheapest-total' })).toEqual([
      'seller_five',
      'seller_two',
      'seller_four',
      'seller_one',
      'seller_three'
    ]);
    expect(names({ minItems: 5 })).toEqual(['seller_three']);
    expect(names({ minItems: 6 })).toEqual([]);
  });

  it('trims each seller to the budget before minItems is applied', () => {
    // At 200 DKK seller_one keeps 2 of 4 items (40 + 60 + 50 shipping) and seller_three 3 of 5
    // (30 + 50 + 60 + 40 shipping); two and four fit whole.
    const result = rank({ maxTotal: 200, ranking: 'most-items' });
    expect(result.results.map((r) => [r.sellerName, r.itemCount, r.offeredCount])).toEqual([
      ['seller_three', 3, 5],
      ['seller_one', 2, 4],
      ['seller_two', 2, 2],
      ['seller_four', 2, 2]
    ]);
    expect(result.results[0].total.amount).toBe(180);
    expect(result.results[1].total.amount).toBe(150);
    // minItems counts the trimmed order: only seller_three still has 3 items.
    expect(names({ maxTotal: 200, minItems: 3 })).toEqual(['seller_three']);
    expect(names({ maxTotal: null, minItems: 3 })).toEqual(['seller_three', 'seller_one']);
  });

  it('drops a seller whose required picks alone exceed the budget', () => {
    // Release 1 costs 150, 120 and 160 landed at one, two and three: none fits in 100.
    expect(names({ requiredGroups: [[1]], maxTotal: 100, minItems: 1 })).toEqual([]);
    // At 140 only seller_two's pick (80 + 40) fits, and its other item does not fit beside it.
    const kept = rank({ requiredGroups: [[1]], maxTotal: 140, minItems: 1 }).results;
    expect(kept.map((r) => r.sellerName)).toEqual(['seller_two']);
    expect(kept[0].items.map((i) => i.listing.releaseId)).toEqual([1]);
    expect(kept[0].offeredCount).toBe(2);
    expect(kept[0].total.amount).toBe(120);
    expect(names({ requiredGroups: [[1]], maxTotal: 140 })).toEqual([]);
  });

  it('leaves the cheapest-anywhere baseline untrimmed by the budget', () => {
    // seller_three's 180 DKK order of releases 5, 4, 3 would cost 30 + 90 + 100 separately,
    // with release 5's cheapest price still coming from seller_three's own untrimmed listing.
    const three = rank({ maxTotal: 200, ranking: 'savings' }).results.find(
      (r) => r.sellerName === 'seller_three'
    )!;
    expect(three.items.map((i) => i.listing.releaseId).sort()).toEqual([3, 4, 5]);
    expect(three.savings.amount).toBe(40);
  });

  it('keeps a dropped seller in the cheapest-anywhere baseline', () => {
    // seller_five (1 item, dropped) still sets release 6's cheapest price to 50.
    const four = rank({ ranking: 'savings' }).results.find((r) => r.sellerName === 'seller_four')!;
    expect(four.savings.amount).toBe(-120);
  });

  it('paginates and reports the full count', () => {
    const page1 = rank({ page: 1, pageSize: 2 });
    expect(page1.results.map((r) => r.sellerName)).toEqual(['seller_three', 'seller_one']);
    expect(page1).toMatchObject({ total: 4, page: 1, pageSize: 2 });

    const page2 = rank({ page: 2, pageSize: 2 });
    expect(page2.results.map((r) => r.sellerName)).toEqual(['seller_two', 'seller_four']);
    expect(page2.total).toBe(4);

    const page3 = rank({ page: 3, pageSize: 2 });
    expect(page3.results).toEqual([]);
    expect(page3).toMatchObject({ total: 4, page: 3, pageSize: 2 });
  });

  it('rejects invalid params with a RankingError', () => {
    for (const bad of [
      { page: 0 },
      { page: 1.5 },
      { pageSize: 0 },
      { minItems: 0 },
      { maxTotal: 0 },
      { maxTotal: -1 },
      { maxTotal: Infinity },
      { maxTotal: NaN }
    ]) {
      expect(() => rank(bad)).toThrow(RankingError);
    }
    expect(() => rank({ currency: '' })).toThrow(/currency/);
    expect(() => rank({ maxTotal: -1 })).toThrow(/maxTotal/);
    expect(() => rank({ ranking: 'random' as SearchParams['ranking'] })).toThrow(/ranking/);
    try {
      rank({ pageSize: -1 });
    } catch (error) {
      expect((error as RankingError).code).toBe('invalid-params');
    }
  });

  it('propagates an unknown listing currency as a RankingError', () => {
    const usd = { ...listings[0], id: 999, price: { amount: 1, currency: 'USD' } };
    expect(() => rank({}, [...listings, usd])).toThrow(RankingError);
  });

  it('returns no results for an empty wantlist or no listings', () => {
    expect(rankSellers([], listings, rates, DEFAULT_SEARCH_PARAMS).total).toBe(0);
    expect(rank({}, []).total).toBe(0);
  });
});
