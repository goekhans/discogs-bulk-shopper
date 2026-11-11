import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/** A cached value with the time it was fetched from upstream. */
export interface Snapshot<T> {
  /** ISO 8601 timestamp. */
  fetchedAt: string;
  data: T;
}

export interface CacheOptions {
  /** Directory the JSON files are stored in. Defaults to CACHE_DIR, then <cwd>/.cache. */
  cacheDir?: string;
  now?: () => number;
}

const KEY_PATTERN = /^[a-z0-9_-]+$/i;

export function resolveCacheDir(options: CacheOptions = {}): string {
  return options.cacheDir ?? process.env.CACHE_DIR ?? path.join(process.cwd(), '.cache');
}

function snapshotPath(key: string, options: CacheOptions): string {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(`Invalid cache key "${key}": only letters, digits, "_" and "-" are allowed`);
  }
  return path.join(resolveCacheDir(options), `${key}.json`);
}

/** Returns the stored snapshot for a key, or null if there is none or it is unreadable. */
export async function readSnapshot<T>(
  key: string,
  options: CacheOptions = {}
): Promise<Snapshot<T> | null> {
  const file = snapshotPath(key, options);
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Snapshot<T>>;
    if (typeof parsed?.fetchedAt !== 'string' || !('data' in parsed)) return null;
    return { fetchedAt: parsed.fetchedAt, data: parsed.data as T };
  } catch {
    // A corrupt file is treated as a cache miss; the next write replaces it.
    return null;
  }
}

/** Atomically writes a snapshot (temp file + rename), creating the cache dir on demand. */
export async function writeSnapshot<T>(
  key: string,
  data: T,
  options: CacheOptions = {}
): Promise<Snapshot<T>> {
  const file = snapshotPath(key, options);
  const now = options.now ?? Date.now;
  const snapshot: Snapshot<T> = { fetchedAt: new Date(now()).toISOString(), data };

  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(snapshot), 'utf8');
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return snapshot;
}

/** True when the snapshot was fetched less than ttlMs ago. */
export function isFresh(snapshot: Snapshot<unknown>, ttlMs: number, now = Date.now()): boolean {
  const fetched = Date.parse(snapshot.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  return now - fetched < ttlMs;
}
