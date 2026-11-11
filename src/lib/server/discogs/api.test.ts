import { describe, expect, it, vi } from 'vitest';
import {
  DISCOGS_BASE_URL,
  DiscogsApiError,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  USER_AGENT,
  createDiscogsClient
} from './api';

const TOKEN = 'test-token-not-real';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  });
}

/** Fake clock whose sleep advances time instead of waiting. */
function fakeClock(start = 1_000_000) {
  let t = start;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    slept
  };
}

function client(fetchMock: ReturnType<typeof vi.fn>, clock = fakeClock()) {
  return createDiscogsClient({
    fetch: fetchMock as unknown as typeof fetch,
    now: clock.now,
    sleep: clock.sleep,
    config: () => ({ username: 'example_user', token: TOKEN })
  });
}

describe('discogsFetch', () => {
  it('sends auth and user-agent headers to the base URL and parses JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const { discogsFetch } = client(fetchMock);

    const result = await discogsFetch<{ ok: boolean }>('/users/example_user/wants?page=1');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DISCOGS_BASE_URL}/users/example_user/wants?page=1`);
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Discogs token=${TOKEN}`);
    expect(headers.get('User-Agent')).toBe(USER_AGENT);
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('throws DiscogsApiError with status and path on non-2xx, without the token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'nope' }, { status: 404 }));
    const { discogsFetch } = client(fetchMock);

    const err = await discogsFetch<DiscogsApiError>('/releases/1').catch(
      (e: unknown) => e as DiscogsApiError
    );
    expect(err).toBeInstanceOf(DiscogsApiError);
    expect(err).toMatchObject({ status: 404, path: '/releases/1' });
    expect(String(err.message)).not.toContain(TOKEN);
    expect(String(err.stack)).not.toContain(TOKEN);
  });

  it('retries on 429 honouring Retry-After and succeeds within 3 attempts', async () => {
    const clock = fakeClock();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(jsonResponse({ done: true }));
    const { discogsFetch } = client(fetchMock, clock);

    await expect(discogsFetch('/x')).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(clock.slept).toEqual([2000, 5000]);
  });

  it('gives up after 3 attempts of 429', async () => {
    const clock = fakeClock();
    const fetchMock = vi.fn(async () =>
      jsonResponse({}, { status: 429, headers: { 'Retry-After': '1' } })
    );
    const { discogsFetch } = client(fetchMock, clock);

    await expect(discogsFetch('/x')).rejects.toMatchObject({ status: 429, path: '/x' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Sleeps between attempts only, not after the last one.
    expect(clock.slept).toEqual([1000, 1000]);
  });

  it('throttles to at most 60 requests per sliding minute', async () => {
    const clock = fakeClock();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const { discogsFetch, sent } = client(fetchMock, clock);

    for (let i = 0; i < RATE_LIMIT; i++) await discogsFetch('/r');
    expect(clock.slept).toEqual([]);
    expect(sent).toHaveLength(RATE_LIMIT);

    // The 61st request must wait until the first one leaves the window.
    const start = clock.now();
    await discogsFetch('/r');
    expect(clock.slept).toEqual([RATE_WINDOW_MS]);
    expect(clock.now()).toBe(start + RATE_WINDOW_MS);
    expect(fetchMock).toHaveBeenCalledTimes(RATE_LIMIT + 1);

    // Once the window has moved on, requests go straight through again.
    clock.advance(RATE_WINDOW_MS);
    await discogsFetch('/r');
    expect(clock.slept).toHaveLength(1);
  });

  it('serialises concurrent requests through the throttle', async () => {
    const clock = fakeClock();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const { discogsFetch } = client(fetchMock, clock);

    await Promise.all(Array.from({ length: RATE_LIMIT + 2 }, () => discogsFetch('/c')));
    expect(fetchMock).toHaveBeenCalledTimes(RATE_LIMIT + 2);
    expect(clock.slept.length).toBeGreaterThanOrEqual(1);
    expect(clock.now()).toBeGreaterThanOrEqual(1_000_000 + RATE_WINDOW_MS);
  });
});
