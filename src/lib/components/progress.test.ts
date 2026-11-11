import { describe, expect, it } from 'vitest';
import { describeScrapeProgress, scrapeProgressFraction } from './progress';

describe('scrapeProgressFraction', () => {
  it('is 0 without progress', () => {
    expect(scrapeProgressFraction(null)).toBe(0);
    expect(
      scrapeProgressFraction({ chunk: 1, chunks: 1, pagesDone: 0, itemsSoFar: 0, total: 0 })
    ).toBe(0);
  });

  it('is the page fraction of a single chunk, capped at 1', () => {
    expect(
      scrapeProgressFraction({ chunk: 1, chunks: 1, pagesDone: 2, itemsSoFar: 500, total: 1000 })
    ).toBe(0.5);
    expect(
      scrapeProgressFraction({ chunk: 1, chunks: 1, pagesDone: 9, itemsSoFar: 1000, total: 1000 })
    ).toBe(1);
  });

  it('counts finished chunks', () => {
    expect(
      scrapeProgressFraction({ chunk: 2, chunks: 2, pagesDone: 0, itemsSoFar: 0, total: 1000 })
    ).toBe(0.5);
  });
});

describe('describeScrapeProgress', () => {
  it('describes a starting job and a running one', () => {
    expect(describeScrapeProgress(null)).toBe('Starting…');
    expect(
      describeScrapeProgress({ chunk: 1, chunks: 1, pagesDone: 1, itemsSoFar: 250, total: 600 })
    ).toBe('1 page · 250 listings so far');
    expect(
      describeScrapeProgress({ chunk: 2, chunks: 3, pagesDone: 4, itemsSoFar: 1000, total: 600 })
    ).toBe('Chunk 2 of 3 · 4 pages · 1.000 listings so far');
  });
});
