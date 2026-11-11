import type { Grade, Listing, Money, WantlistItem } from '#lib/domain/types.js';

export type RankingMode = 'bang-for-buck' | 'most-items' | 'cheapest-total' | 'savings';

export interface SearchParams {
  /**
   * Any-of sets: a seller is ranked only if, for every group, it offers at least one of that
   * group's releases. A group usually holds the pressings of one master release.
   */
  requiredGroups: number[][];
  /** Releases that are never picked from any seller. */
  excludedReleaseIds: number[];
  minMediaGrade: Grade | null;
  minSleeveGrade: Grade | null;
  /** ISO 4217 code every amount in the result is converted to. */
  currency: string;
  ranking: RankingMode;
  /** Sellers offering fewer wantlist items than this are dropped (at least 1). */
  minItems: number;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  requiredGroups: [],
  excludedReleaseIds: [],
  minMediaGrade: null,
  minSleeveGrade: null,
  currency: 'DKK',
  ranking: 'bang-for-buck',
  minItems: 2,
  page: 1,
  pageSize: 10
};

/**
 * The subset of an exchange-rate table the ranking needs. Structurally compatible with the
 * server's Rates, but declared here so client code can import the ranking without pulling in
 * server modules.
 */
export interface RateTable {
  base: string;
  rates: Record<string, number>;
}

/** The listing picked for one release from one seller, with amounts in the result currency. */
export interface ChosenItem {
  listing: Listing;
  wantlistItem: WantlistItem | null;
  price: Money;
  shipping: Money | null;
}

export interface SellerResult {
  sellerId: number;
  sellerName: string;
  sellerRating: number | null;
  sellerRatingCount: number | null;
  sellerCountry: string;
  items: ChosenItem[];
  itemCount: number;
  itemsTotal: Money;
  /** The single highest shipping quote among the items: a bulk order ships once. */
  shippingEstimate: Money;
  /** True when at least one item has no shipping quote (counted as 0 in the estimate). */
  shippingUnknown: boolean;
  total: Money;
  perItem: Money;
  /** Sum of the cheapest landed price per release anywhere minus this seller's total. */
  savings: Money;
  currency: string;
}

export interface RankResult {
  results: SellerResult[];
  /** Number of ranked sellers across all pages. */
  total: number;
  page: number;
  pageSize: number;
}

export class RankingError extends Error {
  readonly code: 'invalid-params' | 'unknown-currency';

  constructor(message: string, code: RankingError['code']) {
    super(message);
    this.name = 'RankingError';
    this.code = code;
  }
}
