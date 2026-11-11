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

/** "1998 · Vinyl, LP"; missing parts are left out, falling back to the release id. */
export function variantLabel(item: WantlistItem): string {
  const parts: string[] = [];
  if (item.year) parts.push(String(item.year));
  if (item.format) parts.push(item.format);
  return parts.length ? parts.join(' · ') : `Release #${item.releaseId}`;
}

/** The wantlist items that are pressings of one master release (or a single masterless item). */
export interface WantlistGroup {
  /** The master id, or the release id for an item without a master. */
  key: number;
  masterId: number | null;
  /** "Artist – Title" of the variant added to the wantlist first. */
  label: string;
  /** Sorted by year (unknown last), then format. */
  variants: WantlistItem[];
}

const byYearThenFormat = (a: WantlistItem, b: WantlistItem) => {
  if (a.year !== b.year) {
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    return a.year - b.year;
  }
  return a.format.localeCompare(b.format);
};

/**
 * Groups wantlist items by master release, keeping the input order of first appearance. Items
 * without a master form a group of their own keyed by release id.
 */
export function groupWantlist(items: WantlistItem[]): WantlistGroup[] {
  const groups = new Map<number, { earliest: WantlistItem; variants: WantlistItem[] }>();
  for (const item of items) {
    const key = item.masterId ?? item.releaseId;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { earliest: item, variants: [item] });
      continue;
    }
    group.variants.push(item);
    if (item.addedAt < group.earliest.addedAt) group.earliest = item;
  }
  return [...groups].map(([key, { earliest, variants }]) => ({
    key,
    masterId: earliest.masterId,
    label: `${earliest.artist} – ${earliest.title}`,
    variants: [...variants].sort(byYearThenFormat)
  }));
}

/**
 * Groups with a variant whose artist or title contains the query (case-insensitive), each
 * carrying only the variants not in `excludeIds`; groups left without variants are dropped. An
 * empty query matches everything; the result is capped at `limit`.
 */
export function filterWantlistGroups(
  groups: WantlistGroup[],
  query: string,
  excludeIds: number[] = [],
  limit = 8
): WantlistGroup[] {
  const needle = query.trim().toLowerCase();
  const excluded = new Set(excludeIds);
  const matches: WantlistGroup[] = [];
  for (const group of groups) {
    if (
      needle &&
      !group.variants.some(
        (item) =>
          item.artist.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle)
      )
    ) {
      continue;
    }
    const variants = group.variants.filter((item) => !excluded.has(item.releaseId));
    if (variants.length === 0) continue;
    matches.push(variants.length === group.variants.length ? group : { ...group, variants });
    if (matches.length >= limit) break;
  }
  return matches;
}
