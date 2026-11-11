import type { ScrapeProgress } from './listings';

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export interface JobState {
  status: JobStatus;
  progress: ScrapeProgress | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export type JobListener = (state: JobState) => void;

/** The one refresh job of the process, with listeners for the progress stream. */
export interface JobRegistry {
  get(): JobState;
  /** Returns false (and does nothing) when a job is already running. */
  start(run: (report: (progress: ScrapeProgress) => void) => Promise<unknown>): boolean;
  subscribe(listener: JobListener): () => void;
}

export function createJobRegistry(now: () => number = Date.now): JobRegistry {
  let state: JobState = {
    status: 'idle',
    progress: null,
    startedAt: null,
    finishedAt: null,
    error: null
  };
  const listeners = new Set<JobListener>();

  const set = (patch: Partial<JobState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  return {
    get: () => state,
    start(run) {
      if (state.status === 'running') return false;
      set({
        status: 'running',
        progress: null,
        startedAt: new Date(now()).toISOString(),
        finishedAt: null,
        error: null
      });
      const fail = (err: unknown) =>
        set({
          status: 'error',
          finishedAt: new Date(now()).toISOString(),
          error: err instanceof Error ? err.message : String(err)
        });
      try {
        // run() starts synchronously so the first progress report lands before start() returns;
        // a synchronous throw still ends the job in the error state instead of leaving it running.
        void run((progress) => set({ progress })).then(
          () => set({ status: 'done', finishedAt: new Date(now()).toISOString() }),
          fail
        );
      } catch (err) {
        fail(err);
      }
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

const REGISTRY_KEY = Symbol.for('discogs-bulk-shopper.listingsJob');

/** The process-wide registry, kept on globalThis so dev-server reloads share it. */
export function getJobRegistry(): JobRegistry {
  const slot = globalThis as { [REGISTRY_KEY]?: JobRegistry };
  slot[REGISTRY_KEY] ??= createJobRegistry();
  return slot[REGISTRY_KEY];
}
