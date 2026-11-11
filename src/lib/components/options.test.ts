import { describe, expect, it } from 'vitest';
import type { WantlistItem } from '#lib/domain/types.js';
import {
  ANY_GRADE,
  CURRENCY_OPTIONS,
  GRADE_OPTIONS,
  RANKING_OPTIONS,
  filterWantlistGroups,
  gradeToValue,
  groupWantlist,
  valueToGrade,
  variantLabel,
  wantlistLabel
} from './options';

const item = (overrides: Partial<WantlistItem>): WantlistItem => ({
  releaseId: 1,
  masterId: null,
  title: 'Title',
  artist: 'Artist',
  year: 2000,
  format: 'Vinyl, LP',
  thumbUrl: null,
  addedAt: '2026-01-01T00:00:00Z',
  ...overrides
});

describe('option lists', () => {
  it('puts Any first and the best grade next', () => {
    expect(GRADE_OPTIONS[0]).toEqual({ value: ANY_GRADE, label: 'Any' });
    expect(GRADE_OPTIONS[1].value).toBe('M');
    expect(GRADE_OPTIONS.at(-1)?.value).toBe('P');
    expect(GRADE_OPTIONS).toHaveLength(9);
  });

  it('lists the supported currencies and every ranking mode', () => {
    expect(CURRENCY_OPTIONS.map((o) => o.value)).toEqual([
      'DKK',
      'EUR',
      'USD',
      'GBP',
      'SEK',
      'NOK'
    ]);
    expect(RANKING_OPTIONS.map((o) => o.value)).toEqual([
      'bang-for-buck',
      'most-items',
      'cheapest-total',
      'savings'
    ]);
  });
});

describe('grade conversion', () => {
  it('round-trips grades and maps Any to null', () => {
    expect(gradeToValue(null)).toBe(ANY_GRADE);
    expect(gradeToValue('VG+')).toBe('VG+');
    expect(valueToGrade('VG+')).toBe('VG+');
    expect(valueToGrade(ANY_GRADE)).toBeNull();
    expect(valueToGrade('nope')).toBeNull();
  });
});

describe('wantlistLabel', () => {
  it('joins artist, title, year and format', () => {
    expect(wantlistLabel(item({}))).toBe('Artist – Title · 2000 · Vinyl, LP');
  });

  it('leaves out a missing year or format', () => {
    expect(wantlistLabel(item({ year: null, format: '' }))).toBe('Artist – Title');
  });
});

describe('variantLabel', () => {
  it('joins year and format, omitting missing parts', () => {
    expect(variantLabel(item({}))).toBe('2000 · Vinyl, LP');
    expect(variantLabel(item({ year: null }))).toBe('Vinyl, LP');
    expect(variantLabel(item({ format: '' }))).toBe('2000');
  });

  it('falls back to the release id when both are missing', () => {
    expect(variantLabel(item({ releaseId: 42, year: null, format: '' }))).toBe('Release #42');
  });
});

/** Fabricated wantlist: one master with three pressings, two masterless items. */
const items = [
  item({
    releaseId: 11,
    masterId: 900,
    artist: 'Alpha Band',
    title: 'Record One (Reissue)',
    year: 2015,
    format: 'Vinyl, LP, Reissue',
    addedAt: '2026-02-01T00:00:00Z'
  }),
  item({ releaseId: 2, masterId: null, artist: 'Beta Band', title: 'Record Two' }),
  item({
    releaseId: 10,
    masterId: 900,
    artist: 'Alpha Band',
    title: 'Record One',
    year: 1990,
    format: 'Vinyl, LP',
    addedAt: '2026-01-01T00:00:00Z'
  }),
  item({
    releaseId: 12,
    masterId: 900,
    artist: 'Alpha Band',
    title: 'Record One (Promo)',
    year: null,
    format: 'CD',
    addedAt: '2026-03-01T00:00:00Z'
  }),
  item({ releaseId: 3, masterId: null, artist: 'Gamma Band', title: 'Record Three' })
];

describe('groupWantlist', () => {
  const groups = groupWantlist(items);

  it('groups by master in order of first appearance and keys masterless items by release', () => {
    expect(groups.map((g) => [g.key, g.masterId])).toEqual([
      [900, 900],
      [2, null],
      [3, null]
    ]);
    expect(groups[1].variants.map((v) => v.releaseId)).toEqual([2]);
  });

  it('labels a group from the earliest-added variant', () => {
    expect(groups[0].label).toBe('Alpha Band – Record One');
    expect(groups[1].label).toBe('Beta Band – Record Two');
  });

  it('sorts variants by year with unknown years last, then by format', () => {
    expect(groups[0].variants.map((v) => v.releaseId)).toEqual([10, 11, 12]);
    const sameYear = groupWantlist([
      item({ releaseId: 1, masterId: 5, year: 2000, format: 'Vinyl, LP' }),
      item({ releaseId: 2, masterId: 5, year: 2000, format: 'CD' })
    ]);
    expect(sameYear[0].variants.map((v) => v.releaseId)).toEqual([2, 1]);
  });

  it('returns no groups for an empty wantlist', () => {
    expect(groupWantlist([])).toEqual([]);
  });
});

describe('filterWantlistGroups', () => {
  const groups = groupWantlist(items);
  const keys = (result: ReturnType<typeof filterWantlistGroups>) => result.map((g) => g.key);

  it('matches the artist or title of any variant, case-insensitively', () => {
    expect(keys(filterWantlistGroups(groups, 'BETA'))).toEqual([2]);
    expect(keys(filterWantlistGroups(groups, 'promo'))).toEqual([900]);
    expect(keys(filterWantlistGroups(groups, 'record'))).toEqual([900, 2, 3]);
  });

  it('returns everything for an empty query, up to the limit', () => {
    expect(keys(filterWantlistGroups(groups, '  '))).toEqual([900, 2, 3]);
    expect(filterWantlistGroups(groups, '', [], 2)).toHaveLength(2);
  });

  it('hides excluded variants and drops groups left without any', () => {
    const partial = filterWantlistGroups(groups, '', [10, 2]);
    expect(keys(partial)).toEqual([900, 3]);
    expect(partial[0].variants.map((v) => v.releaseId)).toEqual([11, 12]);
    expect(keys(filterWantlistGroups(groups, '', [10, 11, 12]))).toEqual([2, 3]);
  });

  it('returns the same group object when nothing is excluded from it', () => {
    expect(filterWantlistGroups(groups, '')[0]).toBe(groups[0]);
  });
});
