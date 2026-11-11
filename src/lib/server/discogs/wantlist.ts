import type { WantlistItem } from '#lib/domain/types.js';
import { isFresh, readSnapshot, writeSnapshot, type Snapshot } from '#lib/server/cache.js';
import { discogsFetch, type DiscogsFetch } from './api';
import type { DiscogsConfig } from './config';

export const WANTLIST_TTL_MS = 24 * 60 * 60 * 1000;
export const WANTLIST_CACHE_KEY = 'wantlist';
const PER_PAGE = 100;

/** The subset of a Discogs `GET /users/{username}/wants` response we read. */
export interface WantsPage {
  pagination: { page: number; pages: number; per_page?: number; items?: number };
  wants: Want[];
}

export interface Want {
  id: number;
  date_added: string;
  basic_information: {
    id: number;
    title: string;
    year?: number;
    thumb?: string;
    formats?: { name: string; qty?: string; descriptions?: string[] }[];
    artists?: { name: string; join?: string }[];
  };
}

export interface WantlistResult {
  items: WantlistItem[];
  fetchedAt: string;
}

export interface WantlistCache {
  read: (key: string) => Promise<Snapshot<WantlistItem[]> | null>;
  write: (key: string, data: WantlistItem[]) => Promise<Snapshot<WantlistItem[]>>;
}

export interface WantlistDeps {
  fetchJson: DiscogsFetch;
  config: () => Pick<DiscogsConfig, 'username'> | Promise<Pick<DiscogsConfig, 'username'>>;
  cache: WantlistCache;
  now: () => number;
}

const defaultDeps: WantlistDeps = {
  fetchJson: discogsFetch,
  // Loaded lazily so the env module is only touched when a request actually needs it.
  config: async () => (await import('./config')).getConfig(),
  cache: {
    read: (key) => readSnapshot<WantlistItem[]>(key),
    write: (key, data) => writeSnapshot(key, data)
  },
  now: Date.now
};

/** Strips Discogs's numeric disambiguator, e.g. "Madlib (2)" -> "Madlib". */
export function stripDisambiguator(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

export function mapWant(want: Want): WantlistItem {
  const info = want.basic_information;
  const [primary] = info.formats ?? [];
  const format = primary
    ? [primary.name, ...(primary.descriptions ?? [])].filter(Boolean).join(', ')
    : '';
  return {
    releaseId: info.id,
    title: info.title,
    artist: (info.artists ?? []).map((a) => stripDisambiguator(a.name)).join(', '),
    year: info.year ? info.year : null,
    format,
    thumbUrl: info.thumb ? info.thumb : null,
    addedAt: want.date_added
  };
}

async function fetchAllWants(deps: WantlistDeps): Promise<WantlistItem[]> {
  const { username } = await deps.config();
  const byRelease = new Map<number, WantlistItem>();
  let page = 1;
  let pages: number;
  do {
    const path = `/users/${encodeURIComponent(username)}/wants?per_page=${PER_PAGE}&page=${page}`;
    const body = await deps.fetchJson<WantsPage>(path);
    for (const want of body.wants ?? []) {
      const item = mapWant(want);
      if (!byRelease.has(item.releaseId)) byRelease.set(item.releaseId, item);
    }
    pages = body.pagination?.pages ?? 1;
    page += 1;
  } while (page <= pages);
  return [...byRelease.values()];
}

/**
 * Returns the user's wantlist, served from the 24h cache unless `force` is set or the
 * snapshot is missing or stale.
 */
export async function getWantlist(
  { force = false }: { force?: boolean } = {},
  deps: Partial<WantlistDeps> = {}
): Promise<WantlistResult> {
  const d: WantlistDeps = { ...defaultDeps, ...deps };

  if (!force) {
    const cached = await d.cache.read(WANTLIST_CACHE_KEY);
    if (cached && isFresh(cached, WANTLIST_TTL_MS, d.now())) {
      return { items: cached.data, fetchedAt: cached.fetchedAt };
    }
  }

  const items = await fetchAllWants(d);
  const snapshot = await d.cache.write(WANTLIST_CACHE_KEY, items);
  return { items, fetchedAt: snapshot.fetchedAt };
}
