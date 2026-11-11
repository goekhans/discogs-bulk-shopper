import type { WantlistItem } from '#lib/domain/types.js';

export interface SessionInfo {
  loggedIn: boolean;
  username: string | null;
  shipTo: { code: string; name: string } | null;
  checkedAt: string;
}

export interface ListingsSummary {
  count: number;
  fetchedAt: string;
  shipTo: string;
  shipToName: string | null;
  loggedIn: boolean;
  stale: boolean;
}

export interface WantlistData {
  items: WantlistItem[];
  fetchedAt: string;
  count: number;
}

export interface ScrapeProgress {
  chunk: number;
  chunks: number;
  pagesDone: number;
  itemsSoFar: number;
  total: number;
}

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

/** Mirrors the server's JobState, as streamed by GET /api/listings/progress. */
export interface JobState {
  status: JobStatus;
  progress: ScrapeProgress | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

/** How following a progress stream ended: the job finished, or the store stopped listening. */
export type FollowOutcome = 'ended' | 'detached';

export type DataPart = 'session' | 'listings' | 'wantlist' | 'login' | 'shipTo';

/** The subset of EventSource the store relies on, so tests can pass a fake. */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export interface DataStoreOptions {
  fetch?: typeof fetch;
  eventSource?: (url: string) => EventSourceLike;
}

export class DataError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.status = status;
  }
}

const byArtistThenTitle = (a: WantlistItem, b: WantlistItem) =>
  a.artist.localeCompare(b.artist, 'da') || a.title.localeCompare(b.title, 'da');

/** Session, listings-snapshot and wantlist state shared by the whole app. */
export class DataStore {
  session = $state<SessionInfo | null>(null);
  listings = $state<ListingsSummary | null>(null);
  wantlist = $state<WantlistData | null>(null);
  job = $state<JobState | null>(null);
  busy = $state<Record<DataPart, boolean>>({
    session: false,
    listings: false,
    wantlist: false,
    login: false,
    shipTo: false
  });
  errors = $state<Partial<Record<DataPart, DataError>>>({});

  readonly wantlistItems = $derived(
    this.wantlist ? [...this.wantlist.items].sort(byArtistThenTitle) : []
  );
  readonly refreshing = $derived(this.job?.status === 'running');

  readonly #fetch: typeof fetch;
  readonly #eventSource: (url: string) => EventSourceLike;
  /** The progress stream being followed, with the resolver that settles its promise. */
  /** Overlapping runs of one part (e.g. two refreshListings) keep it busy until all end. */
  #active: Record<DataPart, number> = { session: 0, listings: 0, wantlist: 0, login: 0, shipTo: 0 };
  #follow: { stream: EventSourceLike; settle: (outcome: FollowOutcome) => void } | null = null;

  constructor(options: DataStoreOptions = {}) {
    this.#fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.#eventSource =
      options.eventSource ?? ((url) => new EventSource(url) as unknown as EventSourceLike);
  }

  /** Loads every part in parallel; a failing part is recorded in `errors`, the others still load. */
  async loadAll(): Promise<void> {
    await Promise.all([this.refreshSession(), this.loadListings(), this.loadWantlist()]);
  }

  async refreshSession(force = false): Promise<void> {
    await this.#run('session', async () => {
      this.session = await this.#json<SessionInfo>(`/api/session${force ? '?force=1' : ''}`);
    });
  }

  /** Reads the cached listings summary; null when no snapshot exists yet. */
  async loadListings(): Promise<void> {
    await this.#run('listings', async () => {
      const response = await this.#fetch('/api/listings');
      if (response.status === 404) {
        this.listings = null;
        return;
      }
      this.listings = await this.#body<ListingsSummary>(response);
    });
  }

  /**
   * Starts a scrape (or joins the running one on 409) and follows its progress until it ends,
   * then reloads the summary.
   */
  async refreshListings(force = false): Promise<void> {
    await this.#run('listings', async () => {
      const response = await this.#fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });
      if (!response.ok && response.status !== 409) await this.#body(response);
      // 'detached': disconnect() or a newer refreshListings() took over; the job may still run.
      if ((await this.#followJob()) === 'detached') return;
      const summary = await this.#fetch('/api/listings');
      this.listings = summary.status === 404 ? null : await this.#body<ListingsSummary>(summary);
      if (this.job?.status === 'error') {
        throw new DataError('job', this.job.error ?? 'The listings refresh failed');
      }
    });
  }

  async loadWantlist(): Promise<void> {
    await this.#run('wantlist', async () => {
      this.wantlist = await this.#json<WantlistData>('/api/wantlist');
    });
  }

  async refreshWantlist(): Promise<void> {
    await this.#run('wantlist', async () => {
      this.wantlist = await this.#json<WantlistData>('/api/wantlist?force=1');
    });
  }

  /** Opens the Discogs login in the scraper's Chrome window and waits for it. */
  async login(): Promise<void> {
    await this.#run('login', async () => {
      await this.#json('/api/session/login', { method: 'POST' });
      await this.refreshSession(true);
    });
  }

  /** Opens the Discogs buyer settings in the scraper's Chrome window and waits for it. */
  async changeShipTo(): Promise<void> {
    await this.#run('shipTo', async () => {
      await this.#json('/api/session/ship-to', { method: 'POST' });
      await this.refreshSession(true);
    });
  }

  /** Stops following the progress stream (the job itself keeps running on the server). */
  disconnect(): void {
    this.#settleFollow('detached');
  }

  #settleFollow(outcome: FollowOutcome): void {
    const follow = this.#follow;
    if (!follow) return;
    this.#follow = null;
    follow.stream.close();
    follow.settle(outcome);
  }

  #followJob(): Promise<FollowOutcome> {
    this.disconnect();
    return new Promise<FollowOutcome>((resolve) => {
      const stream = this.#eventSource('/api/listings/progress');
      this.#follow = { stream, settle: resolve };
      const finish = () => {
        // Only the active follow may settle itself; a detached one was settled by disconnect().
        if (this.#follow?.stream === stream) this.#settleFollow('ended');
      };
      stream.onmessage = (event) => {
        if (this.#follow?.stream !== stream) return;
        let state: JobState;
        try {
          state = JSON.parse(event.data) as JobState;
        } catch {
          return;
        }
        this.job = state;
        if (state.status !== 'running') finish();
      };
      // The server closes the stream when the job ends; the browser reports that as an error.
      stream.onerror = () => finish();
    });
  }

  async #run(part: DataPart, work: () => Promise<void>): Promise<void> {
    this.#active[part] += 1;
    this.busy = { ...this.busy, [part]: true };
    const errors = { ...this.errors };
    delete errors[part];
    this.errors = errors;
    try {
      await work();
    } catch (err) {
      const error =
        err instanceof DataError
          ? err
          : new DataError('network', err instanceof Error ? err.message : String(err));
      this.errors = { ...this.errors, [part]: error };
    } finally {
      this.#active[part] -= 1;
      if (this.#active[part] === 0) this.busy = { ...this.busy, [part]: false };
    }
  }

  async #json<T>(url: string, init?: RequestInit): Promise<T> {
    return this.#body<T>(await this.#fetch(url, init));
  }

  async #body<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : 'http';
      // A Discogs failure never surfaces the server's message: it could name the wantlist path.
      const message =
        code === 'discogs'
          ? 'Discogs could not be reached'
          : typeof body.message === 'string'
            ? body.message
            : `Request failed (${response.status})`;
      throw new DataError(code, message, response.status);
    }
    return body as T;
  }
}

let singleton: DataStore | null = null;

/** The app-wide store, created on first use so importing the module touches no browser APIs. */
export function getDataStore(): DataStore {
  singleton ??= new DataStore();
  return singleton;
}
