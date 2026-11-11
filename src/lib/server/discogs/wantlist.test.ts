import { describe, expect, it, vi } from 'vitest';
import type { WantlistItem } from '#lib/domain/types.js';
import type { Snapshot } from '#lib/server/cache.js';
import page1 from './__fixtures__/wants-page.json';
import {
  WANTLIST_CACHE_KEY,
  WANTLIST_TTL_MS,
  getWantlist,
  mapWant,
  type WantlistCache,
  type WantsPage
} from './wantlist';

const USERNAME = 'example_user';
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Page 2 of the fixture: one new release plus a duplicate of a page-1 release. */
function buildPage2(): WantsPage {
  const base = clone(page1) as WantsPage;
  const fresh = clone(base.wants[0]);
  fresh.id = 9001;
  fresh.basic_information.id = 9001;
  fresh.basic_information.title = 'Trans-Europe Express';
  fresh.basic_information.year = 1977;
  fresh.date_added = '2024-06-20T11:00:00-07:00';
  const duplicate = clone(base.wants[1]);
  return { pagination: { page: 2, pages: 2 }, wants: [fresh, duplicate] };
}

function memoryCache(initial: Snapshot<WantlistItem[]> | null = null) {
  const store = new Map<string, Snapshot<WantlistItem[]>>();
  if (initial) store.set(WANTLIST_CACHE_KEY, initial);
  const cache: WantlistCache = {
    read: vi.fn(async (key: string) => store.get(key) ?? null),
    write: vi.fn(async (key: string, data: WantlistItem[]) => {
      const snapshot = { fetchedAt: new Date(NOW).toISOString(), data };
      store.set(key, snapshot);
      return snapshot;
    })
  };
  return { cache, store };
}

function pagedFetch() {
  const pages: Record<string, WantsPage> = { '1': page1 as WantsPage, '2': buildPage2() };
  const fetchJson = vi.fn(async (path: string) => {
    const page = new URL(path, 'https://api.discogs.com').searchParams.get('page') ?? '1';
    const body = pages[page];
    if (!body) throw new Error(`unexpected page ${page}`);
    return body;
  });
  return fetchJson as unknown as <T>(path: string) => Promise<T>;
}

const deps = () => ({
  fetchJson: pagedFetch(),
  config: () => ({ username: USERNAME }),
  now: () => NOW
});

describe('mapWant', () => {
  it('maps basic_information into a WantlistItem', () => {
    expect(mapWant((page1 as WantsPage).wants[0])).toEqual({
      releaseId: 1810,
      title: 'Autobahn',
      artist: 'Kraftwerk',
      year: 1974,
      format: 'Vinyl, LP, Album',
      thumbUrl: 'https://i.discogs.com/example/R-1810-thumb.jpeg',
      addedAt: '2024-03-11T18:42:07-07:00'
    });
  });

  it('joins artists, strips disambiguators, and nulls year 0 and empty thumb', () => {
    expect(mapWant((page1 as WantsPage).wants[1])).toEqual({
      releaseId: 2404,
      title: 'Piñata',
      artist: 'Freddie Gibbs, Madlib',
      year: null,
      format: 'Vinyl, LP, Album, Reissue',
      thumbUrl: null,
      addedAt: '2024-05-02T09:15:33-07:00'
    });
  });

  it('copes with missing formats and artists', () => {
    const item = mapWant({
      id: 1,
      date_added: '2024-01-01T00:00:00-00:00',
      basic_information: { id: 1, title: 'Untitled' }
    });
    expect(item).toMatchObject({ artist: '', format: '', year: null, thumbUrl: null });
  });
});

describe('getWantlist', () => {
  it('pages through all pages, de-duplicates by releaseId and writes the cache', async () => {
    const { cache } = memoryCache();
    const d = { ...deps(), cache };

    const result = await getWantlist({}, d);

    expect(d.fetchJson).toHaveBeenCalledTimes(2);
    expect(d.fetchJson).toHaveBeenNthCalledWith(1, `/users/${USERNAME}/wants?per_page=100&page=1`);
    expect(d.fetchJson).toHaveBeenNthCalledWith(2, `/users/${USERNAME}/wants?per_page=100&page=2`);
    expect(result.items.map((i) => i.releaseId)).toEqual([1810, 2404, 9001]);
    expect(result.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(cache.write).toHaveBeenCalledWith(WANTLIST_CACHE_KEY, result.items);
  });

  it('serves a fresh snapshot from the cache without calling the API', async () => {
    const cachedItems: WantlistItem[] = [mapWant((page1 as WantsPage).wants[0])];
    const { cache } = memoryCache({
      fetchedAt: new Date(NOW - WANTLIST_TTL_MS + 60_000).toISOString(),
      data: cachedItems
    });
    const d = { ...deps(), cache };

    const result = await getWantlist({}, d);

    expect(d.fetchJson).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
    expect(result.items).toEqual(cachedItems);
  });

  it('refetches when the snapshot is older than the TTL', async () => {
    const { cache } = memoryCache({
      fetchedAt: new Date(NOW - WANTLIST_TTL_MS).toISOString(),
      data: []
    });
    const d = { ...deps(), cache };

    const result = await getWantlist({}, d);

    expect(d.fetchJson).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(3);
  });

  it('bypasses a fresh cache when force is set', async () => {
    const { cache } = memoryCache({ fetchedAt: new Date(NOW).toISOString(), data: [] });
    const d = { ...deps(), cache };

    const result = await getWantlist({ force: true }, d);

    expect(d.fetchJson).toHaveBeenCalledTimes(2);
    expect(cache.read).not.toHaveBeenCalled();
    expect(cache.write).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(3);
  });
});
