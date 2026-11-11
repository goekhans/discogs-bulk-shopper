import type { ScrapeProgress } from '#lib/stores/data.svelte.js';

/** Largest page Discogs returns; mirrors PAGE_SIZE in the server scraper, which is not importable here. */
const SCRAPE_PAGE_SIZE = 250;

/**
 * Overall completion of a scrape in [0, 1]: finished chunks plus the fraction of the current one.
 * Pages are counted across chunks, so this is exact for a single chunk (wantlists under 2000
 * releases) and an approximation after that.
 */
export function scrapeProgressFraction(progress: ScrapeProgress | null): number {
  if (!progress || progress.chunks <= 0) return 0;
  const withinChunk =
    progress.total > 0 ? Math.min(1, (progress.pagesDone * SCRAPE_PAGE_SIZE) / progress.total) : 0;
  const done = Math.max(0, progress.chunk - 1) + withinChunk;
  return Math.min(1, done / progress.chunks);
}

/** "Chunk 1 of 2 · 3 pages · 612 listings so far" for the live status text. */
export function describeScrapeProgress(progress: ScrapeProgress | null): string {
  if (!progress) return 'Starting…';
  const parts = [];
  if (progress.chunks > 1) parts.push(`Chunk ${progress.chunk} of ${progress.chunks}`);
  parts.push(`${progress.pagesDone} ${progress.pagesDone === 1 ? 'page' : 'pages'}`);
  parts.push(`${progress.itemsSoFar.toLocaleString('da-DK')} listings so far`);
  return parts.join(' · ');
}
