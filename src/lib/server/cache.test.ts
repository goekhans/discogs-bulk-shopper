import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFresh, readSnapshot, writeSnapshot } from './cache';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'dbs-cache-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('writeSnapshot / readSnapshot', () => {
  it('round-trips data with a fetchedAt timestamp', async () => {
    const now = () => Date.UTC(2026, 0, 2, 3, 4, 5);
    const written = await writeSnapshot('wantlist', { items: [1, 2, 3] }, { cacheDir, now });
    expect(written).toEqual({ fetchedAt: '2026-01-02T03:04:05.000Z', data: { items: [1, 2, 3] } });

    const read = await readSnapshot<{ items: number[] }>('wantlist', { cacheDir });
    expect(read).toEqual(written);
  });

  it('stores {fetchedAt, data} JSON at <cacheDir>/<key>.json and leaves no temp files', async () => {
    await writeSnapshot('abc_1-2', 'hello', { cacheDir });
    const raw = JSON.parse(await readFile(path.join(cacheDir, 'abc_1-2.json'), 'utf8'));
    expect(Object.keys(raw).sort()).toEqual(['data', 'fetchedAt']);
    expect(raw.data).toBe('hello');
    expect(await readdir(cacheDir)).toEqual(['abc_1-2.json']);
  });

  it('creates a missing cache dir on demand', async () => {
    const nested = path.join(cacheDir, 'a', 'b');
    await writeSnapshot('k', 1, { cacheDir: nested });
    expect(await readSnapshot('k', { cacheDir: nested })).toMatchObject({ data: 1 });
  });

  it('returns null for a missing key', async () => {
    expect(await readSnapshot('nope', { cacheDir })).toBeNull();
  });

  it('honours the CACHE_DIR env var when no option is given', async () => {
    const previous = process.env.CACHE_DIR;
    process.env.CACHE_DIR = cacheDir;
    try {
      await writeSnapshot('env', 42);
      expect(await readdir(cacheDir)).toEqual(['env.json']);
      expect(await readSnapshot('env')).toMatchObject({ data: 42 });
    } finally {
      if (previous === undefined) delete process.env.CACHE_DIR;
      else process.env.CACHE_DIR = previous;
    }
  });

  it.each(['../escape', 'a/b', 'a.b', '', 'sp ace', 'x\\y'])('rejects key %j', async (key) => {
    await expect(writeSnapshot(key, 1, { cacheDir })).rejects.toThrow(/Invalid cache key/);
    await expect(readSnapshot(key, { cacheDir })).rejects.toThrow(/Invalid cache key/);
  });
});

describe('isFresh', () => {
  const snapshot = { fetchedAt: '2026-01-01T00:00:00.000Z', data: null };
  const fetched = Date.parse(snapshot.fetchedAt);

  it('is fresh while younger than the TTL', () => {
    expect(isFresh(snapshot, 1000, fetched)).toBe(true);
    expect(isFresh(snapshot, 1000, fetched + 999)).toBe(true);
  });

  it('is stale once the TTL has elapsed', () => {
    expect(isFresh(snapshot, 1000, fetched + 1000)).toBe(false);
    expect(isFresh(snapshot, 1000, fetched + 60_000)).toBe(false);
  });

  it('treats an unparsable timestamp as stale', () => {
    expect(isFresh({ fetchedAt: 'garbage', data: null }, 1000, fetched)).toBe(false);
  });
});
