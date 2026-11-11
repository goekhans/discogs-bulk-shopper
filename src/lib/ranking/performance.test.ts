import { describe, expect, it } from 'vitest';
import type { Listing, WantlistItem } from '#lib/domain/types.js';
import { GRADES } from '#lib/domain/grades.js';
import { rankSellers } from './rank';
import { DEFAULT_SEARCH_PARAMS, type RateTable } from './types';

/** mulberry32: a tiny seeded PRNG so the data set is the same on every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WANTLIST_SIZE = 1000;
const SELLERS = 400;
const LISTINGS = 10_000;
const CURRENCIES = ['DKK', 'EUR', 'GBP', 'SEK', 'USD'];
const rates: RateTable = {
  base: 'DKK',
  rates: { EUR: 0.134, GBP: 0.117, SEK: 1.52, USD: 0.155 }
};

function buildData(seed = 42): { wantlist: WantlistItem[]; listings: Listing[] } {
  const random = prng(seed);
  const int = (max: number) => Math.floor(random() * max);

  const wantlist: WantlistItem[] = Array.from({ length: WANTLIST_SIZE }, (_, i) => ({
    releaseId: 100_000 + i,
    masterId: null,
    title: `Release ${i}`,
    artist: `Artist ${i % 97}`,
    year: 1960 + (i % 60),
    format: 'Vinyl, LP',
    thumbUrl: null,
    addedAt: '2026-01-01T00:00:00Z'
  }));

  const listings: Listing[] = Array.from({ length: LISTINGS }, (_, i) => {
    const sellerId = 1 + int(SELLERS);
    const currency = CURRENCIES[sellerId % CURRENCIES.length];
    const hasShipping = random() > 0.1;
    return {
      id: 1_000_000 + i,
      // ~2% of listings are for releases that are not on the wantlist.
      releaseId: 100_000 + int(Math.floor(WANTLIST_SIZE * 1.02)),
      sellerId,
      sellerName: `seller_${String(sellerId).padStart(4, '0')}`,
      sellerRating: 90 + random() * 10,
      sellerRatingCount: int(5000),
      sellerCountry: 'Nowhere',
      price: { amount: Math.round(random() * 50_000) / 100, currency },
      shipping: hasShipping ? { amount: Math.round(random() * 5_000) / 100, currency } : null,
      mediaCondition: GRADES[int(GRADES.length)],
      sleeveCondition: random() > 0.2 ? GRADES[int(GRADES.length)] : null,
      url: `https://www.discogs.com/sell/item/${i}`,
      listedAt: null
    };
  });

  return { wantlist, listings };
}

describe('rankSellers performance', () => {
  it('ranks 10,000 listings over 1,000 wantlist items and 400 sellers in under 200ms', () => {
    const { wantlist, listings } = buildData();
    const params = { ...DEFAULT_SEARCH_PARAMS, minMediaGrade: 'G' as const, pageSize: 50 };

    // One warm-up run so JIT compilation is not what the assertion measures.
    rankSellers(wantlist, listings, rates, { ...params, ranking: 'savings' });

    const started = performance.now();
    const result = rankSellers(wantlist, listings, rates, params);
    const elapsed = performance.now() - started;

    console.log(`rankSellers: ${elapsed.toFixed(1)}ms for ${result.total} ranked sellers`);
    expect(result.total).toBeGreaterThan(300);
    expect(result.results).toHaveLength(50);
    expect(elapsed).toBeLessThan(200);
  });
});
