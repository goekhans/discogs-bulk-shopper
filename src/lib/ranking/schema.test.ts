import { describe, expect, it } from 'vitest';
import { parseSearchParams, parseSearchRequest, searchParamsSchema } from './schema.js';
import { DEFAULT_SEARCH_PARAMS } from './types.js';

describe('searchParamsSchema', () => {
  it('applies the defaults to an empty body', () => {
    expect(searchParamsSchema.parse({})).toEqual(DEFAULT_SEARCH_PARAMS);
  });

  it('rejects an unknown ranking mode', () => {
    const result = searchParamsSchema.safeParse({ ranking: 'random' });
    expect(result.success).toBe(false);
  });

  it('accepts every grade and rejects unknown ones', () => {
    expect(searchParamsSchema.parse({ minMediaGrade: 'VG+' }).minMediaGrade).toBe('VG+');
    expect(searchParamsSchema.parse({ minSleeveGrade: null }).minSleeveGrade).toBeNull();
    expect(searchParamsSchema.safeParse({ minMediaGrade: 'Mint' }).success).toBe(false);
  });

  it('uppercases and validates the currency', () => {
    expect(searchParamsSchema.parse({ currency: ' eur ' }).currency).toBe('EUR');
    expect(searchParamsSchema.safeParse({ currency: 'EURO' }).success).toBe(false);
  });

  it('dedupes release ids and rejects non-positive ones', () => {
    const parsed = searchParamsSchema.parse({
      requiredReleaseIds: [3, 1, 3],
      excludedReleaseIds: [2, 2]
    });
    expect(parsed.requiredReleaseIds).toEqual([3, 1]);
    expect(parsed.excludedReleaseIds).toEqual([2]);
    expect(searchParamsSchema.safeParse({ requiredReleaseIds: [0] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ requiredReleaseIds: [1.5] }).success).toBe(false);
  });

  it('bounds page, pageSize and minItems', () => {
    expect(searchParamsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ minItems: 0 }).success).toBe(false);
    expect(searchParamsSchema.parse({ pageSize: 100 }).pageSize).toBe(100);
  });
});

describe('parseSearchRequest', () => {
  it('splits params from the lowercased shipTo', () => {
    const result = parseSearchRequest({ shipTo: 'DK', page: 2 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shipTo).toBe('dk');
    expect(result.data.params).toEqual({ ...DEFAULT_SEARCH_PARAMS, page: 2 });
    expect('shipTo' in result.data.params).toBe(false);
  });

  it('defaults shipTo to null and accepts "unknown"', () => {
    const none = parseSearchRequest({});
    expect(none.success && none.data.shipTo).toBeNull();
    const unknown = parseSearchRequest({ shipTo: 'Unknown' });
    expect(unknown.success && unknown.data.shipTo).toBe('unknown');
  });

  it('returns flattened issues on failure', () => {
    const result = parseSearchRequest({ shipTo: 'Denmark', page: 'x' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.issues.fieldErrors).sort()).toEqual(['page', 'shipTo']);
  });
});

describe('parseSearchParams', () => {
  it('returns null for malformed input', () => {
    expect(parseSearchParams('nope')).toBeNull();
    expect(parseSearchParams({ ranking: 'bogus' })).toBeNull();
    expect(parseSearchParams({ currency: 'sek' })?.currency).toBe('SEK');
  });
});
