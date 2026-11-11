import { DEFAULT_SEARCH_PARAMS, type SearchParams, type SellerResult } from '#lib/ranking/index.js';
import { parseSearchParams, type SearchDataStatus } from '#lib/ranking/schema.js';

export const SEARCH_STORAGE_KEY = 'dbs:search';

export type SearchStatus = 'idle' | 'loading' | 'loading-more' | 'done' | 'error';

export interface SearchError {
  code: string;
  message: string;
  issues?: unknown;
}

export interface SearchStoreOptions {
  fetch?: typeof fetch;
  /** Defaults to globalThis.localStorage when it exists; pass null to disable persistence. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readStoredParams(storage: Pick<Storage, 'getItem'> | null): SearchParams | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SEARCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseSearchParams(JSON.parse(raw));
    return parsed ? { ...parsed, page: DEFAULT_SEARCH_PARAMS.page } : null;
  } catch {
    return null;
  }
}

function errorMessage(code: string, status: number): string {
  switch (code) {
    case 'no-listings':
      return 'No listings have been fetched yet. Refresh the listings first.';
    case 'invalid-params':
      return 'The search parameters are invalid.';
    case 'unknown-currency':
      return 'Exchange rates for that currency are not available.';
    case 'config':
      return 'The Discogs credentials are not configured.';
    case 'discogs':
      return 'Discogs could not be reached.';
    default:
      return `Search failed (${status}).`;
  }
}

/** Search parameters, results and paging state for the seller ranking. */
export class SearchStore {
  params = $state<SearchParams>({ ...DEFAULT_SEARCH_PARAMS });
  results = $state<SellerResult[]>([]);
  total = $state(0);
  status = $state<SearchStatus>('idle');
  error = $state<SearchError | null>(null);
  dataStatus = $state<SearchDataStatus | null>(null);

  /** Params of the last successful search(), minus page; loadMore pages through these. */
  #lastSearch = $state<Omit<SearchParams, 'page'> | null>(null);

  readonly hasMore = $derived(this.#lastSearch !== null && this.results.length < this.total);
  readonly loading = $derived(this.status === 'loading' || this.status === 'loading-more');

  readonly #fetch: typeof fetch;
  readonly #storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Lets a stale response be ignored when a newer search has started. */
  #requestId = 0;

  constructor(options: SearchStoreOptions = {}) {
    this.#fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.#storage = options.storage === undefined ? defaultStorage() : options.storage;
    const stored = readStoredParams(this.#storage);
    if (stored) this.params = stored;
  }

  setParams(patch: Partial<Omit<SearchParams, 'page'>>): void {
    this.params = { ...this.params, ...patch };
    this.#persist();
  }

  /**
   * Adds releases to the Must-have any-of group they belong to. `groupIds` is every release id
   * of the master (or just the release): the ids join the first existing group that overlaps
   * it, otherwise they start a new group. The ids leave the exclusions.
   */
  addRequired(releaseIds: number[], groupIds: number[] = releaseIds): void {
    const ids = unique(releaseIds);
    if (ids.length === 0) return;
    const members = [...groupIds, ...ids];
    const groups = this.params.requiredGroups;
    const index = groups.findIndex((group) => group.some((id) => members.includes(id)));
    const requiredGroups =
      index === -1
        ? [...groups, ids]
        : groups.map((group, i) => (i === index ? withIds(group, ids) : group));
    this.setParams({
      requiredGroups,
      excludedReleaseIds: withoutIds(this.params.excludedReleaseIds, ids)
    });
  }

  /** Removes the releases from every any-of group, dropping groups left empty. */
  removeRequired(releaseIds: number[]): void {
    this.setParams({ requiredGroups: groupsWithout(this.params.requiredGroups, releaseIds) });
  }

  addExcluded(releaseIds: number[]): void {
    const ids = unique(releaseIds);
    if (ids.length === 0) return;
    this.setParams({
      excludedReleaseIds: withIds(this.params.excludedReleaseIds, ids),
      requiredGroups: groupsWithout(this.params.requiredGroups, ids)
    });
  }

  removeExcluded(releaseIds: number[]): void {
    this.setParams({ excludedReleaseIds: withoutIds(this.params.excludedReleaseIds, releaseIds) });
  }

  /** Runs a fresh search from page 1, replacing the results. */
  async search(): Promise<void> {
    this.params = { ...this.params, page: 1 };
    this.status = 'loading';
    this.error = null;
    await this.#request(this.params, false);
  }

  /** Fetches the next page and appends it. No-op while loading or when every seller is shown. */
  async loadMore(): Promise<void> {
    const last = this.#lastSearch;
    if (this.loading || !this.hasMore || !last) return;
    const page = this.params.page + 1;
    this.params = { ...this.params, page };
    this.status = 'loading-more';
    // Edits since the last search must not append rows ranked or filtered differently.
    await this.#request({ ...last, page }, true);
  }

  reset(): void {
    this.#requestId += 1;
    this.#lastSearch = null;
    this.params = { ...DEFAULT_SEARCH_PARAMS };
    this.results = [];
    this.total = 0;
    this.status = 'idle';
    this.error = null;
    this.dataStatus = null;
    this.#persist();
  }

  async #request(requested: SearchParams, append: boolean): Promise<void> {
    const id = ++this.#requestId;
    const params = $state.snapshot(requested);
    try {
      const response = await this.#fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (id !== this.#requestId) return;

      if (!response.ok) {
        const code = typeof body.error === 'string' ? body.error : 'http';
        this.#fail(
          {
            code,
            message:
              typeof body.message === 'string' ? body.message : errorMessage(code, response.status),
            ...(body.issues !== undefined ? { issues: body.issues } : {})
          },
          append
        );
        return;
      }

      const page = body as unknown as {
        results: SellerResult[];
        total: number;
        dataStatus: SearchDataStatus;
      };
      this.results = append ? [...this.results, ...page.results] : page.results;
      this.total = page.total;
      this.dataStatus = page.dataStatus;
      this.status = 'done';
      if (!append) {
        const last: Partial<SearchParams> = { ...params };
        delete last.page;
        this.#lastSearch = last as Omit<SearchParams, 'page'>;
      }
    } catch (err) {
      if (id !== this.#requestId) return;
      this.#fail(
        { code: 'network', message: err instanceof Error ? err.message : String(err) },
        append
      );
    }
  }

  #fail(error: SearchError, append: boolean): void {
    if (append) this.params = { ...this.params, page: this.params.page - 1 };
    this.error = error;
    this.status = 'error';
  }

  #persist(): void {
    if (!this.#storage) return;
    try {
      const persisted: Partial<SearchParams> = { ...$state.snapshot(this.params) };
      delete persisted.page;
      this.#storage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Storage may be full or disabled; the params still live in memory.
    }
  }
}

function unique(ids: number[]): number[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

function withIds(ids: number[], added: number[]): number[] {
  const missing = added.filter((id) => !ids.includes(id));
  return missing.length ? [...ids, ...missing] : ids;
}

function withoutIds(ids: number[], removed: number[]): number[] {
  return removed.some((id) => ids.includes(id)) ? ids.filter((x) => !removed.includes(x)) : ids;
}

function groupsWithout(groups: number[][], removed: number[]): number[][] {
  if (!groups.some((group) => group.some((id) => removed.includes(id)))) return groups;
  return groups.map((group) => withoutIds(group, removed)).filter((group) => group.length > 0);
}

let singleton: SearchStore | null = null;

/** The app-wide store, created on first use so importing the module touches no browser APIs. */
export function getSearchStore(): SearchStore {
  singleton ??= new SearchStore();
  return singleton;
}
