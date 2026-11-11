import type { Listing, WantlistItem } from '#lib/domain/types.js';
import { convertMoney } from './money.js';
import type { ChosenItem, RateTable, SearchParams } from './types.js';

export interface SellerGroup {
  sellerId: number;
  sellerName: string;
  sellerRating: number | null;
  sellerRatingCount: number | null;
  sellerCountry: string;
  items: ChosenItem[];
  /** Items the seller offered before the budget trimmed `items`; equals items.length until then. */
  offeredCount: number;
}

/** Price plus shipping in the result currency; a missing shipping quote counts as 0. */
export function landedCost(item: Pick<ChosenItem, 'price' | 'shipping'>): number {
  // Compared in whole cents so a genuine tie is not decided by floating-point noise.
  return Math.round((item.price.amount + (item.shipping?.amount ?? 0)) * 100) / 100;
}

/** Converts a listing's amounts once, so later stages never touch the rates again. */
export function toChosenItem(
  listing: Listing,
  wantlistByRelease: Map<number, WantlistItem>,
  rates: RateTable,
  currency: string
): ChosenItem {
  return {
    listing,
    wantlistItem: wantlistByRelease.get(listing.releaseId) ?? null,
    price: convertMoney(listing.price, currency, rates),
    shipping: listing.shipping === null ? null : convertMoney(listing.shipping, currency, rates)
  };
}

/**
 * True when `candidate` should replace `current` as the seller's pick for a release: lower
 * landed cost, then lower price, then lower listing id.
 */
export function isCheaper(candidate: ChosenItem, current: ChosenItem): boolean {
  const byLanded = landedCost(candidate) - landedCost(current);
  if (byLanded !== 0) return byLanded < 0;
  const byPrice = candidate.price.amount - current.price.amount;
  if (byPrice !== 0) return byPrice < 0;
  return candidate.listing.id < current.listing.id;
}

export function wantlistIndex(wantlist: WantlistItem[]): Map<number, WantlistItem> {
  return new Map(wantlist.map((item) => [item.releaseId, item]));
}

/**
 * Groups already-converted items per seller, keeping the cheapest pick per release. Single
 * pass over the items; the per-seller map of releases makes it O(n).
 */
export function groupChosenItems(items: Iterable<ChosenItem>): Map<number, SellerGroup> {
  const picks = new Map<number, { group: SellerGroup; byRelease: Map<number, ChosenItem> }>();

  for (const item of items) {
    const { listing } = item;
    let entry = picks.get(listing.sellerId);
    if (!entry) {
      entry = {
        group: {
          sellerId: listing.sellerId,
          sellerName: listing.sellerName,
          sellerRating: listing.sellerRating,
          sellerRatingCount: listing.sellerRatingCount,
          sellerCountry: listing.sellerCountry,
          items: [],
          offeredCount: 0
        },
        byRelease: new Map()
      };
      picks.set(listing.sellerId, entry);
    }
    const current = entry.byRelease.get(listing.releaseId);
    if (!current || isCheaper(item, current)) entry.byRelease.set(listing.releaseId, item);
  }

  const groups = new Map<number, SellerGroup>();
  for (const [sellerId, { group, byRelease }] of picks) {
    group.items = [...byRelease.values()];
    group.offeredCount = group.items.length;
    groups.set(sellerId, group);
  }
  return groups;
}

/**
 * Groups listings per seller, choosing for each release the seller's cheapest listing by
 * converted price + converted shipping (ties: lower price, then lower listing id).
 */
export function groupBySeller(
  listings: Listing[],
  wantlist: WantlistItem[],
  rates: RateTable,
  currency: string
): Map<number, SellerGroup> {
  const index = wantlistIndex(wantlist);
  return groupChosenItems(listings.map((l) => toChosenItem(l, index, rates, currency)));
}

/**
 * Drops sellers that offer fewer than max(1, minItems) items or miss a required group: for every
 * group the seller must offer at least one of its releases (any-of). Empty groups are ignored.
 */
export function applySellerConstraints(
  groups: Map<number, SellerGroup>,
  params: Pick<SearchParams, 'requiredGroups' | 'minItems'>
): Map<number, SellerGroup> {
  const required = params.requiredGroups.filter((ids) => ids.length > 0);
  const minItems = Math.max(1, params.minItems);
  const kept = new Map<number, SellerGroup>();

  for (const [sellerId, group] of groups) {
    if (group.items.length < minItems) continue;
    if (required.length > 0) {
      const offered = new Set(group.items.map((item) => item.listing.releaseId));
      if (!required.every((ids) => ids.some((id) => offered.has(id)))) continue;
    }
    kept.set(sellerId, group);
  }
  return kept;
}
