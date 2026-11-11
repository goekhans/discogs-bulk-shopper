import { describe, expect, it, vi } from 'vitest';
import { DataStore, type EventSourceLike, type JobState } from './data.svelte.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const session = {
  loggedIn: true,
  username: 'someone',
  shipTo: { code: 'dk', name: 'Denmark' },
  checkedAt: '2026-11-11T09:00:00Z'
};
const summary = {
  count: 16,
  fetchedAt: '2026-11-11T08:00:00Z',
  shipTo: 'dk',
  shipToName: 'Denmark',
  loggedIn: true,
  stale: false
};
const wantlist = {
  items: [
    {
      releaseId: 2,
      title: 'Zebra',
      artist: 'Ørsted',
      year: null,
      format: '',
      thumbUrl: null,
      addedAt: ''
    },
    {
      releaseId: 1,
      title: 'Beta',
      artist: 'Anna',
      year: null,
      format: '',
      thumbUrl: null,
      addedAt: ''
    },
    {
      releaseId: 3,
      title: 'Alpha',
      artist: 'Anna',
      year: null,
      format: '',
      thumbUrl: null,
      addedAt: ''
    }
  ],
  fetchedAt: '2026-11-11T07:00:00Z',
  count: 3
};

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(state: JobState) {
    this.onmessage?.({ data: JSON.stringify(state) });
  }

  close() {
    this.closed = true;
  }
}

const running = (chunk: number): JobState => ({
  status: 'running',
  progress: { chunk, chunks: 3, pagesDone: chunk, itemsSoFar: chunk * 5, total: 15 },
  startedAt: '2026-11-11T09:00:00Z',
  finishedAt: null,
  error: null
});

type Route = (init?: RequestInit) => Response | Promise<Response>;

/** Routes keyed by "METHOD path"; records the calls made. */
function router(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    calls.push(key);
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request ${key}`);
    return route(init);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function store(routes: Record<string, Route>) {
  FakeEventSource.instances = [];
  const { fetch, calls } = router(routes);
  const s = new DataStore({ fetch, eventSource: (url) => new FakeEventSource(url) });
  return { store: s, calls };
}

describe('DataStore', () => {
  it('loadAll loads every part and tolerates a failing one', async () => {
    const { store: s } = store({
      'GET /api/session': () => jsonResponse(session),
      'GET /api/listings': () => jsonResponse({ error: 'no-listings' }, 404),
      'GET /api/wantlist': () => jsonResponse({ error: 'config', message: 'Missing token' }, 500)
    });
    await s.loadAll();
    expect(s.session).toEqual(session);
    expect(s.listings).toBeNull();
    expect(s.wantlist).toBeNull();
    expect(s.errors.wantlist?.code).toBe('config');
    expect(s.errors.wantlist?.message).toBe('Missing token');
    expect(s.errors.session).toBeUndefined();
    expect(s.errors.listings).toBeUndefined();
    expect(s.busy).toEqual({
      session: false,
      listings: false,
      wantlist: false,
      login: false,
      shipTo: false
    });
  });

  it('sorts the wantlist by artist then title with Danish collation', async () => {
    const { store: s } = store({ 'GET /api/wantlist': () => jsonResponse(wantlist) });
    await s.loadWantlist();
    expect(s.wantlistItems.map((i) => i.releaseId)).toEqual([3, 1, 2]);
    expect(s.wantlist?.items.map((i) => i.releaseId)).toEqual([2, 1, 3]);
  });

  it('refreshListings follows the progress stream and reloads the summary on done', async () => {
    let summaryCalls = 0;
    let posted: unknown = null;
    const { store: s, calls } = store({
      'POST /api/listings': (init) => {
        posted = JSON.parse(String(init?.body));
        return jsonResponse({ started: true }, 202);
      },
      'GET /api/listings': () => {
        summaryCalls += 1;
        return jsonResponse(summary);
      }
    });

    const pending = s.refreshListings(true);
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];
    expect(stream.url).toBe('/api/listings/progress');
    expect(s.busy.listings).toBe(true);
    expect(summaryCalls).toBe(0);

    stream.emit(running(1));
    expect(s.job?.progress?.chunk).toBe(1);
    expect(s.refreshing).toBe(true);
    stream.emit(running(2));
    expect(s.job?.progress?.chunk).toBe(2);

    stream.emit({ ...running(3), status: 'done', finishedAt: '2026-11-11T09:05:00Z' });
    await pending;
    expect(stream.closed).toBe(true);
    expect(s.job?.status).toBe('done');
    expect(s.refreshing).toBe(false);
    expect(s.listings).toEqual(summary);
    expect(s.busy.listings).toBe(false);
    expect(calls[0]).toBe('POST /api/listings');
    expect(posted).toEqual({ force: true });
  });

  it('joins an already-running job on 409 and records a job error', async () => {
    const { store: s } = store({
      'POST /api/listings': () => jsonResponse({ error: 'already-running' }, 409),
      'GET /api/listings': () => jsonResponse(summary)
    });
    const pending = s.refreshListings();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit({
      ...running(1),
      status: 'error',
      finishedAt: '2026-11-11T09:01:00Z',
      error: 'Cloudflare'
    });
    await pending;
    expect(s.job?.status).toBe('error');
    expect(s.job?.error).toBe('Cloudflare');
    expect(s.errors.listings?.code).toBe('job');
    expect(s.listings).toEqual(summary);
  });

  it('records a job that ends in error under errors.listings', async () => {
    const { store: s } = store({
      'POST /api/listings': () => jsonResponse({ started: true }, 202),
      'GET /api/listings': () => jsonResponse(summary)
    });
    const pending = s.refreshListings();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit({ ...running(1), status: 'error', error: 'Cloudflare' });
    await pending;
    expect(s.errors.listings?.code).toBe('job');
    expect(s.errors.listings?.message).toBe('Cloudflare');
    expect(s.listings).toEqual(summary);
    expect(s.busy.listings).toBe(false);
  });

  it('disconnect() settles a pending refreshListings without reloading the summary', async () => {
    let summaryCalls = 0;
    const { store: s } = store({
      'POST /api/listings': () => jsonResponse({ started: true }, 202),
      'GET /api/listings': () => {
        summaryCalls += 1;
        return jsonResponse(summary);
      }
    });
    const pending = s.refreshListings();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];
    stream.emit(running(1));

    s.disconnect();
    await pending;
    expect(stream.closed).toBe(true);
    expect(summaryCalls).toBe(0);
    expect(s.busy.listings).toBe(false);
    expect(s.errors.listings).toBeUndefined();
    expect(s.job?.status).toBe('running');

    // A message arriving on the detached stream changes nothing.
    stream.emit({ ...running(3), status: 'done' });
    expect(s.job?.progress?.chunk).toBe(1);
  });

  it('a second refreshListings() detaches the first and only the second reloads', async () => {
    let summaryCalls = 0;
    const { store: s } = store({
      'POST /api/listings': () => jsonResponse({ started: true }, 202),
      'GET /api/listings': () => {
        summaryCalls += 1;
        return jsonResponse(summary);
      }
    });
    const first = s.refreshListings();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const second = s.refreshListings();
    await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const [one, two] = FakeEventSource.instances;

    await first;
    expect(one.closed).toBe(true);
    expect(summaryCalls).toBe(0);
    expect(s.busy.listings).toBe(true);

    two.emit({ ...running(3), status: 'done' });
    await second;
    expect(two.closed).toBe(true);
    expect(summaryCalls).toBe(1);
    expect(s.listings).toEqual(summary);
    expect(s.busy.listings).toBe(false);
  });

  it('never surfaces the server message of a Discogs failure', async () => {
    const { store: s } = store({
      'GET /api/wantlist': () =>
        jsonResponse(
          {
            error: 'discogs',
            status: 503,
            message: 'Discogs API responded 503 for /users/x/wants'
          },
          502
        )
    });
    await s.loadWantlist();
    expect(s.errors.wantlist?.code).toBe('discogs');
    expect(s.errors.wantlist?.status).toBe(502);
    expect(s.errors.wantlist?.message).toBe('Discogs could not be reached');
  });

  it('records a failed start without subscribing', async () => {
    const { store: s } = store({
      'POST /api/listings': () => jsonResponse({ error: 'scrape', message: 'No Chrome' }, 500)
    });
    await s.refreshListings();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(s.errors.listings?.code).toBe('scrape');
  });

  it('login and changeShipTo post then refresh the session', async () => {
    const { store: s, calls } = store({
      'POST /api/session/login': () => jsonResponse(session),
      'POST /api/session/ship-to': () => jsonResponse(session),
      'GET /api/session?force=1': () => jsonResponse(session)
    });
    await s.login();
    await s.changeShipTo();
    expect(calls).toEqual([
      'POST /api/session/login',
      'GET /api/session?force=1',
      'POST /api/session/ship-to',
      'GET /api/session?force=1'
    ]);
    expect(s.session).toEqual(session);
  });

  it('refreshWantlist forces a refetch', async () => {
    const { store: s, calls } = store({
      'GET /api/wantlist?force=1': () => jsonResponse(wantlist)
    });
    await s.refreshWantlist();
    expect(calls).toEqual(['GET /api/wantlist?force=1']);
    expect(s.wantlist?.count).toBe(3);
  });
});
