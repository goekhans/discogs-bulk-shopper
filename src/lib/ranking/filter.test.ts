import { describe, expect, it } from 'vitest';
import { listings, wantlist } from './__fixtures__/scenario';
import { applyFilters } from './filter';
import { DEFAULT_SEARCH_PARAMS } from './types';

const wantlistIds = new Set(wantlist.map((w) => w.releaseId));
const ids = (result: { id: number }[]) => result.map((l) => l.id).sort((a, b) => a - b);
const sellers = (result: { sellerName: string }[]) => [...new Set(result.map((l) => l.sellerName))];

describe('applyFilters', () => {
  it('keeps only listings on the wantlist', () => {
    const extra = { ...listings[0], id: 999, releaseId: 42 };
    const result = applyFilters([...listings, extra], wantlistIds, DEFAULT_SEARCH_PARAMS);
    expect(ids(result)).toEqual(ids(listings));
  });

  it('drops excluded releases', () => {
    const result = applyFilters(listings, wantlistIds, {
      ...DEFAULT_SEARCH_PARAMS,
      excludedReleaseIds: [1, 6]
    });
    expect(result.some((l) => l.releaseId === 1 || l.releaseId === 6)).toBe(false);
    expect(result).toHaveLength(listings.length - 5);
  });

  it('applies the media filter alone', () => {
    const result = applyFilters(listings, wantlistIds, {
      ...DEFAULT_SEARCH_PARAMS,
      minMediaGrade: 'VG+'
    });
    expect(sellers(result).sort()).toEqual(['seller_four', 'seller_one', 'seller_two']);
  });

  it('applies the sleeve filter alone, failing a null sleeve grade', () => {
    const result = applyFilters(listings, wantlistIds, {
      ...DEFAULT_SEARCH_PARAMS,
      minSleeveGrade: 'NM'
    });
    expect(sellers(result).sort()).toEqual(['seller_four', 'seller_two']);
  });

  it('fails a null sleeve grade even for the lowest sleeve filter', () => {
    const result = applyFilters(listings, wantlistIds, {
      ...DEFAULT_SEARCH_PARAMS,
      minSleeveGrade: 'P'
    });
    expect(sellers(result)).not.toContain('seller_three');
    expect(sellers(result)).toHaveLength(4);
  });

  it('passes a null sleeve grade when there is no sleeve filter', () => {
    const result = applyFilters(listings, wantlistIds, DEFAULT_SEARCH_PARAMS);
    expect(sellers(result)).toContain('seller_three');
    expect(result).toHaveLength(listings.length);
  });

  it('applies both grade filters together', () => {
    const result = applyFilters(listings, wantlistIds, {
      ...DEFAULT_SEARCH_PARAMS,
      minMediaGrade: 'NM',
      minSleeveGrade: 'M'
    });
    expect(sellers(result)).toEqual(['seller_four']);
  });
});
