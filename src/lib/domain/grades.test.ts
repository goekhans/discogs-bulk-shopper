import { describe, expect, it } from 'vitest';
import { GRADES, gradeRank, parseGrade } from './grades';

describe('GRADES', () => {
  it('is ordered from Poor to Mint', () => {
    expect(GRADES).toEqual(['P', 'F', 'G', 'G+', 'VG', 'VG+', 'NM', 'M']);
  });
});

describe('gradeRank', () => {
  it('ranks better grades higher', () => {
    expect(gradeRank('P')).toBe(0);
    expect(gradeRank('M')).toBe(7);
    expect(gradeRank('VG+')).toBeGreaterThan(gradeRank('VG'));
    expect(gradeRank('NM')).toBeLessThan(gradeRank('M'));
  });
});

describe('parseGrade', () => {
  it.each([
    ['Mint (M)', 'M'],
    ['Near Mint (NM or M-)', 'NM'],
    ['Very Good Plus (VG+)', 'VG+'],
    ['Very Good (VG)', 'VG'],
    ['Good Plus (G+)', 'G+'],
    ['Good (G)', 'G'],
    ['Fair (F)', 'F'],
    ['Poor (P)', 'P']
  ])('parses %s', (text, expected) => {
    expect(parseGrade(text)).toBe(expected);
  });

  it('accepts a bare code or long name', () => {
    expect(parseGrade('VG+')).toBe('VG+');
    expect(parseGrade('nm')).toBe('NM');
    expect(parseGrade('Very Good Plus')).toBe('VG+');
    expect(parseGrade('  Near Mint  ')).toBe('NM');
  });

  it('returns null for ungraded or unknown values', () => {
    expect(parseGrade('Generic')).toBeNull();
    expect(parseGrade('Not Graded')).toBeNull();
    expect(parseGrade('No Cover')).toBeNull();
    expect(parseGrade('')).toBeNull();
    expect(parseGrade(null)).toBeNull();
    expect(parseGrade(undefined)).toBeNull();
  });
});
