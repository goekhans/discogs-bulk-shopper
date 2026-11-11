import type { Listing, WantlistItem } from '#lib/domain/types.js';
import { cheapestAnywhere, estimateSellerTotal, savingsFor } from './estimate.js';
import { applyFilters } from './filter.js';
import {
  applySellerConstraints,
  groupChosenItems,
  toChosenItem,
  wantlistIndex,
  type SellerGroup
} from './group.js';
import { round2 } from './money.js';
import {
  RankingError,
  type ChosenItem,
  type RankResult,
  type RankingMode,
  type RateTable,
  type SearchParams,
  type SellerResult
} from './types.js';

const MODES: ReadonlySet<string> = new Set<RankingMode>([
  'bang-for-buck',
  'most-items',
  'cheapest-total',
  'savings'
]);

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

export function validateSearchParams(params: SearchParams): void {
  if (!isPositiveInteger(params.page)) {
    throw new RankingError(`page must be an integer >= 1, got ${params.page}`, 'invalid-params');
  }
  if (!isPositiveInteger(params.pageSize)) {
    throw new RankingError(
      `pageSize must be an integer >= 1, got ${params.pageSize}`,
      'invalid-params'
    );
  }
  if (!isPositiveInteger(params.minItems)) {
    throw new RankingError(
      `minItems must be an integer >= 1, got ${params.minItems}`,
      'invalid-params'
    );
  }
  if (typeof params.currency !== 'string' || !/^[A-Za-z]{3}$/.test(params.currency.trim())) {
    throw new RankingError(`Invalid currency code "${params.currency}"`, 'invalid-params');
  }
  if (!MODES.has(params.ranking)) {
    throw new RankingError(`Unknown ranking mode "${params.ranking}"`, 'invalid-params');
  }
}

type Comparator = (a: SellerResult, b: SellerResult) => number;

const byName: Comparator = (a, b) => a.sellerName.localeCompare(b.sellerName);
const perItemAsc: Comparator = (a, b) => a.perItem.amount - b.perItem.amount;
const totalAsc: Comparator = (a, b) => a.total.amount - b.total.amount;
const itemCountDesc: Comparator = (a, b) => b.itemCount - a.itemCount;
const savingsDesc: Comparator = (a, b) => b.savings.amount - a.savings.amount;

function chain(...comparators: Comparator[]): Comparator {
  return (a, b) => {
    for (const compare of comparators) {
      const order = compare(a, b);
      if (order !== 0) return order;
    }
    return 0;
  };
}

const COMPARATORS: Record<RankingMode, Comparator> = {
  'bang-for-buck': chain(perItemAsc, itemCountDesc, byName),
  'most-items': chain(itemCountDesc, totalAsc, byName),
  'cheapest-total': chain(totalAsc, byName),
  savings: chain(savingsDesc, itemCountDesc, byName)
};

function toSellerResult(
  group: SellerGroup,
  cheapestByRelease: Map<number, number>,
  currency: string
): SellerResult {
  const { items } = group;
  const estimate = estimateSellerTotal(items);
  const money = (amount: number) => ({ amount, currency });
  return {
    sellerId: group.sellerId,
    sellerName: group.sellerName,
    sellerRating: group.sellerRating,
    sellerRatingCount: group.sellerRatingCount,
    sellerCountry: group.sellerCountry,
    items,
    itemCount: items.length,
    itemsTotal: money(estimate.itemsTotal),
    shippingEstimate: money(estimate.shippingEstimate),
    shippingUnknown: estimate.shippingUnknown,
    total: money(estimate.total),
    perItem: money(items.length === 0 ? 0 : round2(estimate.total / items.length)),
    savings: money(savingsFor(items, cheapestByRelease)),
    currency
  };
}

/**
 * Ranks sellers by how well a bulk order from each covers the wantlist. Every stage is a
 * single pass over its input or a sort of the sellers, so the whole run is O(n log n) in the
 * number of listings.
 */
export function rankSellers(
  wantlist: WantlistItem[],
  listings: Listing[],
  rates: RateTable,
  params: SearchParams
): RankResult {
  validateSearchParams(params);
  const currency = params.currency.trim().toUpperCase();
  const index = wantlistIndex(wantlist);

  const filtered = applyFilters(listings, new Set(index.keys()), params);

  const converted: ChosenItem[] = new Array(filtered.length);
  const byRelease = new Map<number, ChosenItem[]>();
  for (let i = 0; i < filtered.length; i++) {
    const item = toChosenItem(filtered[i], index, rates, currency);
    converted[i] = item;
    const releaseItems = byRelease.get(item.listing.releaseId);
    if (releaseItems) releaseItems.push(item);
    else byRelease.set(item.listing.releaseId, [item]);
  }

  const cheapestByRelease = cheapestAnywhere(byRelease);
  const groups = applySellerConstraints(groupChosenItems(converted), params);

  const ranked: SellerResult[] = [];
  for (const group of groups.values()) {
    ranked.push(toSellerResult(group, cheapestByRelease, currency));
  }
  ranked.sort(COMPARATORS[params.ranking]);

  const start = (params.page - 1) * params.pageSize;
  return {
    results: ranked.slice(start, start + params.pageSize),
    total: ranked.length,
    page: params.page,
    pageSize: params.pageSize
  };
}
