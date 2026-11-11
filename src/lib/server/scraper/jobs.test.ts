import { describe, expect, it, vi } from 'vitest';
import { createJobRegistry, getJobRegistry } from './jobs';

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const progress = { chunk: 1, chunks: 1, pagesDone: 1, itemsSoFar: 10, total: 20 };

/** A run the test completes by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('job registry', () => {
  it('starts idle', () => {
    expect(createJobRegistry().get()).toEqual({
      status: 'idle',
      progress: null,
      startedAt: null,
      finishedAt: null,
      error: null
    });
  });

  it('runs one job at a time, reports progress and ends done', async () => {
    const registry = createJobRegistry(() => NOW);
    const run = deferred();
    const listener = vi.fn();
    registry.subscribe(listener);

    expect(
      registry.start(async (report) => {
        report(progress);
        await run.promise;
      })
    ).toBe(true);
    expect(registry.get()).toMatchObject({
      status: 'running',
      progress,
      startedAt: new Date(NOW).toISOString(),
      finishedAt: null
    });
    expect(registry.start(async () => {})).toBe(false);

    run.resolve();
    await tick();
    expect(registry.get()).toMatchObject({
      status: 'done',
      progress,
      finishedAt: new Date(NOW).toISOString(),
      error: null
    });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('records a failure and allows a new start afterwards', async () => {
    const registry = createJobRegistry(() => NOW);
    registry.start(async () => {
      throw new Error('blocked by Cloudflare');
    });
    await tick();
    expect(registry.get()).toMatchObject({ status: 'error', error: 'blocked by Cloudflare' });

    expect(registry.start(async () => {})).toBe(true);
    expect(registry.get()).toMatchObject({ status: 'running', error: null, progress: null });
  });

  it('unsubscribes listeners', async () => {
    const registry = createJobRegistry();
    const listener = vi.fn();
    registry.subscribe(listener)();
    registry.start(async () => {});
    await tick();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shares one registry per process', () => {
    expect(getJobRegistry()).toBe(getJobRegistry());
  });
});
