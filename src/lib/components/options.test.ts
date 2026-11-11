import { describe, expect, it } from 'vitest';
import type { WantlistItem } from '#lib/domain/types.js';
import {
  ANY_GRADE,
  CURRENCY_OPTIONS,
  GRADE_OPTIONS,
  RANKING_OPTIONS,
  filterWantlist,
  gradeToValue,
  valueToGrade,
  wantlistLabel
} from './options';

const item = (overrides: Partial<WantlistItem>): WantlistItem => ({
  releaseId: 1,
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

describe('filterWantlist', () => {
  const items = [
    item({ releaseId: 1, artist: 'Autechre', title: 'Incunabula' }),
    item({ releaseId: 2, artist: 'Boards of Canada', title: 'Geogaddi' }),
    item({ releaseId: 3, artist: 'Aphex Twin', title: 'Selected Ambient Works' })
  ];

  it('matches artist or title case-insensitively', () => {
    expect(filterWantlist(items, 'AUT').map((i) => i.releaseId)).toEqual([1]);
    expect(filterWantlist(items, 'ambient').map((i) => i.releaseId)).toEqual([3]);
  });

  it('returns everything for an empty query, minus excluded ids, up to the limit', () => {
    expect(filterWantlist(items, '  ').map((i) => i.releaseId)).toEqual([1, 2, 3]);
    expect(filterWantlist(items, '', [2]).map((i) => i.releaseId)).toEqual([1, 3]);
    expect(filterWantlist(items, '', [], 2)).toHaveLength(2);
  });
});
