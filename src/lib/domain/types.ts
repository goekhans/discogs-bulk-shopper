import type { Grade } from './grades';

export type { Grade } from './grades';
export { GRADES, gradeRank, parseGrade } from './grades';

/** One release on the user's Discogs wantlist. */
export interface WantlistItem {
  releaseId: number;
  /** The master release this pressing belongs to; null when Discogs has none. */
  masterId: number | null;
  title: string;
  artist: string;
  year: number | null;
  format: string;
  thumbUrl: string | null;
  /** ISO 8601 timestamp of when the release was added to the wantlist. */
  addedAt: string;
}

export interface Money {
  amount: number;
  /** ISO 4217 code. */
  currency: string;
}

/** A marketplace listing of a release by a seller. */
export interface Listing {
  id: number;
  releaseId: number;
  sellerId: number;
  sellerName: string;
  sellerRating: number | null;
  sellerRatingCount: number | null;
  sellerCountry: string;
  price: Money;
  shipping: Money | null;
  mediaCondition: Grade;
  sleeveCondition: Grade | null;
  url: string;
  listedAt: string | null;
}
