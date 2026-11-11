/** Discogs condition grades, ordered from worst (Poor) to best (Mint). */
export const GRADES = ['P', 'F', 'G', 'G+', 'VG', 'VG+', 'NM', 'M'] as const;

export type Grade = (typeof GRADES)[number];

const GRADE_SET: ReadonlySet<string> = new Set(GRADES);

/** Long-form names Discogs uses, lower-cased, for inputs without a bracketed code. */
const GRADE_NAMES: Record<string, Grade> = {
  poor: 'P',
  fair: 'F',
  good: 'G',
  'good plus': 'G+',
  'very good': 'VG',
  'very good plus': 'VG+',
  'near mint': 'NM',
  mint: 'M'
};

/** Position of a grade on the P..M scale; higher is better. */
export function gradeRank(grade: Grade): number {
  return GRADES.indexOf(grade);
}

/**
 * Maps a Discogs condition string to a Grade, e.g. "Very Good Plus (VG+)" -> "VG+" and
 * "Near Mint (NM or M-)" -> "NM". Returns null for unknown or ungraded values ("Generic",
 * "Not Graded", "No Cover").
 */
export function parseGrade(text: string | null | undefined): Grade | null {
  if (!text) return null;
  const trimmed = text.trim();

  const bracketed = /\(([A-Z]+\+?)/.exec(trimmed);
  const code = bracketed ? bracketed[1] : trimmed.toUpperCase();
  if (GRADE_SET.has(code)) return code as Grade;

  const byName =
    GRADE_NAMES[
      trimmed
        .replace(/\s*\(.*$/, '')
        .trim()
        .toLowerCase()
    ];
  return byName ?? null;
}
