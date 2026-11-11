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
    const parsed = searchParamsSchema.parse({ excludedReleaseIds: [2, 2] });
    expect(parsed.excludedReleaseIds).toEqual([2]);
    expect(searchParamsSchema.safeParse({ excludedReleaseIds: [0] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ excludedReleaseIds: [1.5] }).success).toBe(false);
  });

  it('dedupes ids within a required group, drops empty and duplicate groups', () => {
    const parsed = searchParamsSchema.parse({
      requiredGroups: [[3, 1, 3], [], [2], [1, 3]]
    });
    expect(parsed.requiredGroups).toEqual([[3, 1], [2]]);
    expect(searchParamsSchema.safeParse({ requiredGroups: [[0]] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ requiredGroups: [1] }).success).toBe(false);
    expect(searchParamsSchema.safeParse({ requiredGroups: [[1.5]] }).success).toBe(false);
  });

  it('strips unknown keys such as the retired requiredReleaseIds', () => {
    const parsed = searchParamsSchema.parse({ requiredReleaseIds: [7] });
    expect(parsed.requiredGroups).toEqual([]);
    expect('requiredReleaseIds' in parsed).toBe(false);
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

  it('rejects the retired requiredReleaseIds key', () => {
    const result = parseSearchRequest({ requiredReleaseIds: [7] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.formErrors.join(' ')).toContain('requiredReleaseIds');
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

  it('restores params stored before groups existed with an empty requiredGroups', () => {
    const stored = { requiredReleaseIds: [1, 2], excludedReleaseIds: [3], currency: 'EUR' };
    expect(parseSearchParams(stored)).toEqual({
      ...DEFAULT_SEARCH_PARAMS,
      excludedReleaseIds: [3],
      currency: 'EUR'
    });
  });
});
