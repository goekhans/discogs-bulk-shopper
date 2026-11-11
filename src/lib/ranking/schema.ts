import { z } from 'zod';
import { GRADES } from '#lib/domain/grades.js';
import { DEFAULT_SEARCH_PARAMS, type RankingMode, type SearchParams } from './types.js';

/**
 * Request-body validation for POST /api/search and for params restored from localStorage.
 * Client-safe: no server imports. Every field is optional in the input and falls back to
 * DEFAULT_SEARCH_PARAMS.
 */

export const RANKING_MODES = [
  'bang-for-buck',
  'most-items',
  'cheapest-total',
  'savings'
] as const satisfies readonly RankingMode[];

const releaseIds = z
  .array(z.number().int().positive())
  .default([])
  .transform((ids) => [...new Set(ids)]);

const grade = z.enum(GRADES).nullable().default(null);

export const searchParamsSchema = z.object({
  requiredReleaseIds: releaseIds,
  excludedReleaseIds: releaseIds,
  minMediaGrade: grade,
  minSleeveGrade: grade,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Expected a 3-letter ISO 4217 code')
    .default(DEFAULT_SEARCH_PARAMS.currency),
  ranking: z.enum(RANKING_MODES).default(DEFAULT_SEARCH_PARAMS.ranking),
  minItems: z.number().int().min(1).default(DEFAULT_SEARCH_PARAMS.minItems),
  page: z.number().int().min(1).default(DEFAULT_SEARCH_PARAMS.page),
  pageSize: z.number().int().min(1).max(100).default(DEFAULT_SEARCH_PARAMS.pageSize)
});

/** The destination whose listings snapshot to search: a 2-letter country code or 'unknown'. */
export const shipToSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([a-z]{2}|unknown)$/, "Expected a 2-letter country code or 'unknown'");

export const searchRequestSchema = searchParamsSchema.extend({
  shipTo: shipToSchema.optional()
});

export type SearchParamsInput = z.input<typeof searchParamsSchema>;
export type SearchParamsOutput = z.output<typeof searchParamsSchema>;
export type SearchRequestInput = z.input<typeof searchRequestSchema>;
export type SearchRequestOutput = z.output<typeof searchRequestSchema>;

export interface ParsedSearchRequest {
  params: SearchParams;
  shipTo: string | null;
}

export type SearchRequestIssues = z.core.$ZodFlattenedError<SearchRequestInput>;

export type ParseSearchRequestResult =
  { success: true; data: ParsedSearchRequest } | { success: false; issues: SearchRequestIssues };

/** Validates a request body, splitting it into ranking params and the optional ship-to code. */
export function parseSearchRequest(body: unknown): ParseSearchRequestResult {
  const result = searchRequestSchema.safeParse(body);
  if (!result.success) return { success: false, issues: z.flattenError(result.error) };
  const { shipTo, ...params } = result.data;
  return { success: true, data: { params, shipTo: shipTo ?? null } };
}

/** What POST /api/search reports about the data a result was computed from. */
export interface SearchDataStatus {
  wantlistFetchedAt: string;
  wantlistCount: number;
  /** True when Discogs could not be reached and an expired wantlist cache was used instead. */
  wantlistStale: boolean;
  listingsFetchedAt: string;
  listingsCount: number;
  listingsStale: boolean;
  shipTo: string;
  shipToName: string | null;
  loggedIn: boolean;
  ratesDate: string;
  currency: string;
}

/** Validates params alone (e.g. restored from storage); returns null when they do not conform. */
export function parseSearchParams(value: unknown): SearchParams | null {
  const result = searchParamsSchema.safeParse(value);
  return result.success ? result.data : null;
}
