import type { DiscogsConfig } from './config';

export const DISCOGS_BASE_URL = 'https://api.discogs.com';
export const USER_AGENT =
  'DiscogsBulkShopper/0.1 +https://github.com/goekhans/discogs-bulk-shopper';

/** Discogs allows 60 authenticated requests per minute. */
export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;
export const MAX_ATTEMPTS = 3;

/** A non-2xx response. The message carries the status and path only, never the token. */
export class DiscogsApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string) {
    super(`Discogs API responded ${status} for ${path}`);
    this.name = 'DiscogsApiError';
    this.status = status;
    this.path = path;
  }
}

export interface ClientDeps {
  fetch?: typeof fetch;
  /** Clock in ms, used by the throttle. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Supplies the token; defaults to reading the env through config.ts, loaded lazily. */
  config?: () => DiscogsConfig | Promise<DiscogsConfig>;
}

export type DiscogsFetch = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export interface DiscogsClient {
  discogsFetch: DiscogsFetch;
  /** Timestamps of requests inside the current window; exposed for tests. */
  readonly sent: readonly number[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Loaded on first use so that importing this module never pulls in SvelteKit's env modules.
const defaultConfig = async () => (await import('./config')).getConfig();

/** Sliding-window throttle: at most RATE_LIMIT requests in any RATE_WINDOW_MS span. */
function createThrottle(now: () => number, sleep: (ms: number) => Promise<void>) {
  const sent: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  const acquire = async () => {
    for (;;) {
      const t = now();
      while (sent.length && sent[0] <= t - RATE_WINDOW_MS) sent.shift();
      if (sent.length < RATE_LIMIT) {
        sent.push(t);
        return;
      }
      await sleep(sent[0] + RATE_WINDOW_MS - t);
    }
  };

  return {
    sent,
    // Serialise acquisitions so concurrent callers do not all pass the check at once.
    wait(): Promise<void> {
      const turn = queue.then(acquire);
      queue = turn.catch(() => {});
      return turn;
    }
  };
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
}

export function createDiscogsClient(deps: ClientDeps = {}): DiscogsClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const config = deps.config ?? defaultConfig;
  const throttle = createThrottle(now, sleep);

  const discogsFetch = async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
    const { token } = await config();
    const url = `${DISCOGS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Discogs token=${token}`);
    headers.set('User-Agent', USER_AGENT);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');

    let response: Response | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await throttle.wait();
      response = await fetchImpl(url, { ...init, headers });
      if (response.status !== 429) break;
      if (attempt < MAX_ATTEMPTS) await sleep(retryAfterMs(response));
    }
    if (!response) throw new DiscogsApiError(0, path);
    if (!response.ok) throw new DiscogsApiError(response.status, path);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };

  return { discogsFetch, sent: throttle.sent };
}

/** Module-level client whose throttle is shared by every caller in the process. */
const defaultClient = createDiscogsClient();

export const discogsFetch: DiscogsFetch = (path, init) => defaultClient.discogsFetch(path, init);
