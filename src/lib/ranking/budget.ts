import { isCheaper, type SellerGroup } from './group.js';
import { round2 } from './money.js';
import type { ChosenItem, SearchParams } from './types.js';

/** Shipping counted the way estimateSellerTotal counts it: a missing quote is 0. */
function shippingOf(item: ChosenItem): number {
  return item.shipping?.amount ?? 0;
}

/** Same rounding as estimateSellerTotal: both parts rounded, then their sum. */
function estimatedTotal(itemsTotal: number, maxShipping: number): number {
  return round2(round2(itemsTotal) + round2(maxShipping));
}

/** Price ascending, then shipping ascending (null as 0), then listing id: the fill order. */
function byPrice(a: ChosenItem, b: ChosenItem): number {
  return (
    a.price.amount - b.price.amount || shippingOf(a) - shippingOf(b) || a.listing.id - b.listing.id
  );
}

/**
 * Trims each seller's order to a per-seller budget (`maxTotal`, items plus the highest single
 * shipping quote, as estimateSellerTotal computes it). Returns the input map untouched when
 * there is no budget.
 *
 * Per seller the picks are seeded with, for every required any-of group the seller can satisfy,
 * its cheapest offered release by landed cost (ties as in groupChosenItems: lower price, then
 * lower listing id). Groups the seller cannot satisfy are skipped here and leave the seller to
 * applySellerConstraints. A seller whose required picks alone exceed the budget is dropped. The
 * remaining items are then scanned cheapest price first (ties: lower shipping, then listing id)
 * and each is added when the estimate with it still fits; one that does not fit is skipped and
 * the scan continues, since a cheaper-shipping item further on may still fit.
 *
 * The running totals are kept incrementally (O(n log n) per seller for the sort) and rounded the
 * way estimateSellerTotal rounds, so a kept order always estimates within the budget. The output
 * group keeps the seller's original item order filtered to the picks and records the untrimmed
 * count in `offeredCount`.
 */
export function applyBudget(
  groups: Map<number, SellerGroup>,
  params: Pick<SearchParams, 'maxTotal' | 'requiredGroups'>
): Map<number, SellerGroup> {
  const { maxTotal } = params;
  if (maxTotal === null) return groups;

  const required = params.requiredGroups.filter((ids) => ids.length > 0);
  const kept = new Map<number, SellerGroup>();

  for (const [sellerId, group] of groups) {
    const picked = new Set<number>();
    let itemsTotal = 0;
    let maxShipping = 0;

    for (const ids of required) {
      let best: ChosenItem | null = null;
      for (const item of group.items) {
        if (!ids.includes(item.listing.releaseId)) continue;
        if (best === null || isCheaper(item, best)) best = item;
      }
      if (best === null || picked.has(best.listing.id)) continue;
      picked.add(best.listing.id);
      itemsTotal += best.price.amount;
      maxShipping = Math.max(maxShipping, shippingOf(best));
    }
    if (estimatedTotal(itemsTotal, maxShipping) > maxTotal) continue;

    const candidates = group.items.filter((item) => !picked.has(item.listing.id)).sort(byPrice);
    for (const item of candidates) {
      const nextItems = itemsTotal + item.price.amount;
      const nextShipping = Math.max(maxShipping, shippingOf(item));
      if (estimatedTotal(nextItems, nextShipping) > maxTotal) continue;
      picked.add(item.listing.id);
      itemsTotal = nextItems;
      maxShipping = nextShipping;
    }

    kept.set(sellerId, {
      ...group,
      items: group.items.filter((item) => picked.has(item.listing.id)),
      offeredCount: group.items.length
    });
  }
  return kept;
}
