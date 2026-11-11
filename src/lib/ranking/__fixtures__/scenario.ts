import type { Grade, Listing, Money, WantlistItem } from '#lib/domain/types.js';
import type { RateTable } from '../types.js';

/**
 * Rates chosen for easy mental arithmetic in DKK: 1 EUR = 8 DKK, 1 GBP = 10 DKK,
 * 1 SEK = 0.5 DKK.
 */
export const rates: RateTable = {
  base: 'DKK',
  rates: { EUR: 0.125, GBP: 0.1, SEK: 2 }
};

export const wantlist: WantlistItem[] = [1, 2, 3, 4, 5, 6].map((releaseId) => ({
  releaseId,
  masterId: null,
  title: `Release ${releaseId}`,
  artist: `Artist ${releaseId}`,
  year: 1990 + releaseId,
  format: 'Vinyl, LP',
  thumbUrl: null,
  addedAt: '2026-01-01T00:00:00Z'
}));

interface SellerSpec {
  id: number;
  name: string;
  country: string;
  currency: string;
  media: Grade;
  sleeve: Grade | null;
}

const SELLERS: Record<string, SellerSpec> = {
  one: {
    id: 1,
    name: 'seller_one',
    country: 'Denmark',
    currency: 'DKK',
    media: 'VG+',
    sleeve: 'VG'
  },
  two: {
    id: 2,
    name: 'seller_two',
    country: 'Germany',
    currency: 'EUR',
    media: 'NM',
    sleeve: 'NM'
  },
  three: {
    id: 3,
    name: 'seller_three',
    country: 'United Kingdom',
    currency: 'GBP',
    media: 'VG',
    sleeve: null
  },
  four: { id: 4, name: 'seller_four', country: 'Sweden', currency: 'SEK', media: 'M', sleeve: 'M' },
  five: { id: 5, name: 'seller_five', country: 'Denmark', currency: 'DKK', media: 'G', sleeve: 'G' }
};

function listing(
  seller: SellerSpec,
  id: number,
  releaseId: number,
  price: number,
  shipping: number | null
): Listing {
  const money = (amount: number): Money => ({ amount, currency: seller.currency });
  return {
    id,
    releaseId,
    sellerId: seller.id,
    sellerName: seller.name,
    sellerRating: 99.5,
    sellerRatingCount: 1000 + seller.id,
    sellerCountry: seller.country,
    price: money(price),
    shipping: shipping === null ? null : money(shipping),
    mediaCondition: seller.media,
    sleeveCondition: seller.sleeve,
    url: `https://www.discogs.com/sell/item/${id}`,
    listedAt: '2026-11-01T00:00:00Z'
  };
}

/**
 * Landed costs in DKK (price + shipping):
 *
 *   release   one          two    three   four   five
 *   1         150          120    160
 *   2         130          100    130
 *   3         110 (x2)            100
 *   4         90 (x2)             90
 *   5                             30*     150
 *   6                                     100    50
 *
 * (*) seller_three ships release 5 with no quote. seller_one lists releases 3 and 4 twice to
 * exercise the cheapest-per-release tie-breaks. seller_five has one item only.
 *
 * Bulk totals (items + max shipping): one 280+50=330, two 140+40=180, three 350+40=390,
 * four 150+50=200. Cheapest anywhere per release: 120, 100, 100, 90, 30, 50.
 */
export const listings: Listing[] = [
  listing(SELLERS.one, 110, 1, 100, 50),
  listing(SELLERS.one, 120, 2, 80, 50),
  // Same landed cost 110: the lower price (131) wins over the lower id (130).
  listing(SELLERS.one, 130, 3, 62, 48),
  listing(SELLERS.one, 131, 3, 60, 50),
  // Identical landed cost and price: the lower id (140) wins.
  listing(SELLERS.one, 141, 4, 40, 50),
  listing(SELLERS.one, 140, 4, 40, 50),

  listing(SELLERS.two, 210, 1, 10, 5),
  listing(SELLERS.two, 220, 2, 7.5, 5),

  listing(SELLERS.three, 310, 1, 12, 4),
  listing(SELLERS.three, 320, 2, 9, 4),
  listing(SELLERS.three, 330, 3, 6, 4),
  listing(SELLERS.three, 340, 4, 5, 4),
  listing(SELLERS.three, 350, 5, 3, null),

  listing(SELLERS.four, 450, 5, 200, 100),
  listing(SELLERS.four, 460, 6, 100, 100),

  listing(SELLERS.five, 560, 6, 20, 30)
];
