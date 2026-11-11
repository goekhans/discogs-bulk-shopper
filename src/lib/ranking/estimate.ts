import { landedCost } from './group.js';
import { round2 } from './money.js';
import type { ChosenItem } from './types.js';

export interface SellerEstimate {
  itemsTotal: number;
  shippingEstimate: number;
  shippingUnknown: boolean;
  total: number;
}

type Converted = Pick<ChosenItem, 'price' | 'shipping'>;

/**
 * What a bulk order from one seller costs: every item's price plus the single highest
 * shipping quote (Discogs sellers ship an order once). Items without a quote count as 0 and
 * flag the estimate as shippingUnknown. Amounts rounded to 2 decimals.
 */
export function estimateSellerTotal(items: Converted[]): SellerEstimate {
  let itemsTotal = 0;
  let shippingEstimate = 0;
  let shippingUnknown = false;
  for (const item of items) {
    itemsTotal += item.price.amount;
    if (item.shipping === null) shippingUnknown = true;
    else if (item.shipping.amount > shippingEstimate) shippingEstimate = item.shipping.amount;
  }
  itemsTotal = round2(itemsTotal);
  shippingEstimate = round2(shippingEstimate);
  return {
    itemsTotal,
    shippingEstimate,
    shippingUnknown,
    total: round2(itemsTotal + shippingEstimate)
  };
}

/**
 * Per release, the cheapest price + shipping (null shipping as 0) across every seller's
 * listings: what the release would cost bought on its own.
 */
export function cheapestAnywhere(listingsByRelease: Map<number, Converted[]>): Map<number, number> {
  const cheapest = new Map<number, number>();
  for (const [releaseId, entries] of listingsByRelease) {
    let min = Infinity;
    for (const entry of entries) {
      const cost = landedCost(entry);
      if (cost < min) min = cost;
    }
    if (min !== Infinity) cheapest.set(releaseId, round2(min));
  }
  return cheapest;
}

/**
 * How much cheaper the bulk order is than buying each of its items at the cheapest seller
 * anywhere. Negative when the seller's combined shipping does not make up for higher prices.
 */
export function savingsFor(items: ChosenItem[], cheapestByRelease: Map<number, number>): number {
  let separately = 0;
  for (const item of items) {
    separately += cheapestByRelease.get(item.listing.releaseId) ?? landedCost(item);
  }
  return round2(separately - estimateSellerTotal(items).total);
}
