import { readdir } from 'node:fs/promises';
import { resolveCacheDir, type CacheOptions } from '#lib/server/cache.js';
import { readListingsSnapshot } from '#lib/server/scraper/index.js';

export type ListingsSnapshot = NonNullable<Awaited<ReturnType<typeof readListingsSnapshot>>>;

const LISTINGS_FILE = /^listings-([a-z0-9_-]+)\.json$/i;

/** Destination codes with a `listings-<code>.json` snapshot in the cache dir. */
export async function listSnapshotCodes(options: CacheOptions = {}): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(resolveCacheDir(options));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const codes: string[] = [];
  for (const name of names) {
    const match = LISTINGS_FILE.exec(name);
    if (match) codes.push(match[1].toLowerCase());
  }
  return codes;
}

/**
 * The listings snapshot to search: the one for `shipTo` when given, otherwise the most recently
 * fetched snapshot of any destination. Never scrapes and never opens Chrome; null when there is
 * no usable snapshot.
 */
export async function resolveListingsSnapshot(
  shipTo: string | null,
  deps: {
    read?: (code: string) => Promise<ListingsSnapshot | null>;
    codes?: () => Promise<string[]>;
  } = {}
): Promise<ListingsSnapshot | null> {
  const read = deps.read ?? ((code: string) => readListingsSnapshot(code));
  if (shipTo) return read(shipTo);

  const codes = await (deps.codes ?? listSnapshotCodes)();
  let newest: ListingsSnapshot | null = null;
  for (const code of codes) {
    const snapshot = await read(code);
    if (!snapshot) continue;
    if (!newest || Date.parse(snapshot.fetchedAt) > Date.parse(newest.fetchedAt)) {
      newest = snapshot;
    }
  }
  return newest;
}
