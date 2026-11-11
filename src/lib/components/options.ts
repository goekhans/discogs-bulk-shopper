import { GRADES, type Grade } from '#lib/domain/grades.js';
import type { WantlistItem } from '#lib/domain/types.js';
import type { RankingMode } from '#lib/ranking/types.js';

export interface SelectOption {
  value: string;
  label: string;
}

/** Value of the "Any" option in the grade selects; maps to a null grade in the search params. */
export const ANY_GRADE = '';

/** Best grade first, since a minimum is usually picked near the top of the scale. */
export const GRADE_OPTIONS: SelectOption[] = [
  { value: ANY_GRADE, label: 'Any' },
  ...[...GRADES].reverse().map((grade) => ({ value: grade, label: grade }))
];

export const CURRENCY_OPTIONS: SelectOption[] = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'].map(
  (code) => ({ value: code, label: code })
);

export const RANKING_OPTIONS: { value: RankingMode; label: string }[] = [
  { value: 'bang-for-buck', label: 'Best value per item' },
  { value: 'most-items', label: 'Most items, then cheapest' },
  { value: 'cheapest-total', label: 'Cheapest total' },
  { value: 'savings', label: 'Biggest saving vs buying separately' }
];

/** The select value for a grade param and back. */
export function gradeToValue(grade: Grade | null): string {
  return grade ?? ANY_GRADE;
}

export function valueToGrade(value: string): Grade | null {
  return (GRADES as readonly string[]).includes(value) ? (value as Grade) : null;
}

/** "Artist – Title · 1998 · Vinyl, LP"; year and format are left out when missing. */
export function wantlistLabel(item: WantlistItem): string {
  const parts = [`${item.artist} – ${item.title}`];
  if (item.year) parts.push(String(item.year));
  if (item.format) parts.push(item.format);
  return parts.join(' · ');
}

/**
 * Wantlist items whose artist or title contains the query (case-insensitive), excluding the
 * given release IDs. An empty query matches everything; the result is capped at `limit`.
 */
export function filterWantlist(
  items: WantlistItem[],
  query: string,
  excludeIds: number[] = [],
  limit = 8
): WantlistItem[] {
  const needle = query.trim().toLowerCase();
  const excluded = new Set(excludeIds);
  const matches: WantlistItem[] = [];
  for (const item of items) {
    if (excluded.has(item.releaseId)) continue;
    if (
      needle &&
      !item.artist.toLowerCase().includes(needle) &&
      !item.title.toLowerCase().includes(needle)
    ) {
      continue;
    }
    matches.push(item);
    if (matches.length >= limit) break;
  }
  return matches;
}
