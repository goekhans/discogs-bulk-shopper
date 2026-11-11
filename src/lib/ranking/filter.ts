import type { Listing } from '#lib/domain/types.js';
import { gradeRank } from '#lib/domain/grades.js';
import type { SearchParams } from './types.js';

/**
 * Keeps the listings that are on the wantlist, not excluded, and graded at or above the
 * requested minimums. A null filter passes everything; a listing with no sleeve grade fails
 * any sleeve filter.
 */
export function applyFilters(
  listings: Listing[],
  wantlistIds: Set<number>,
  params: Pick<SearchParams, 'excludedReleaseIds' | 'minMediaGrade' | 'minSleeveGrade'>
): Listing[] {
  const excluded = new Set(params.excludedReleaseIds);
  const minMedia = params.minMediaGrade === null ? null : gradeRank(params.minMediaGrade);
  const minSleeve = params.minSleeveGrade === null ? null : gradeRank(params.minSleeveGrade);

  return listings.filter((listing) => {
    if (!wantlistIds.has(listing.releaseId)) return false;
    if (excluded.has(listing.releaseId)) return false;
    if (minMedia !== null && gradeRank(listing.mediaCondition) < minMedia) return false;
    if (minSleeve !== null) {
      if (listing.sleeveCondition === null) return false;
      if (gradeRank(listing.sleeveCondition) < minSleeve) return false;
    }
    return true;
  });
}
