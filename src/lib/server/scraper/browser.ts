import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext } from 'patchright';

export interface BrowserOptions {
  /** Persistent profile directory. Defaults to <cwd>/profile (git-ignored). */
  profileDir?: string;
  /** Run Chrome without a window. Defaults to SCRAPER_HEADLESS (off). */
  headless?: boolean;
}

/** Launch arguments recommended for scraping Discogs through a real Chrome. */
export const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage'];

/**
 * The context promise lives on globalThis so the Vite dev server, which re-evaluates this module
 * on every change, keeps reusing the same Chrome instead of launching one per reload.
 */
const CONTEXT_KEY = Symbol.for('discogs-bulk-shopper.browserContext');
const EXIT_HOOKS_KEY = Symbol.for('discogs-bulk-shopper.browserExitHooks');

interface GlobalSlot {
  [CONTEXT_KEY]?: Promise<BrowserContext>;
  [EXIT_HOOKS_KEY]?: boolean;
}

const slot = globalThis as GlobalSlot;

export function resolveProfileDir(profileDir?: string): string {
  return profileDir ?? path.join(process.cwd(), 'profile');
}

/**
 * Chrome refuses to start on a profile whose previous process crashed, because its lock files
 * (`SingletonLock`, `SingletonSocket`, `SingletonCookie`) are left behind. Remove them first.
 */
export async function removeSingletonFiles(profileDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(profileDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('Singleton'))
      .map((name) => rm(path.join(profileDir, name), { force: true }))
  );
}

async function launch(options: BrowserOptions): Promise<BrowserContext> {
  const profileDir = resolveProfileDir(options.profileDir);
  const headless = options.headless ?? (await isHeadless());
  await removeSingletonFiles(profileDir);
  return chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless,
    viewport: null,
    args: CHROME_ARGS,
    // Chrome only needs these three; the rest of the environment (tokens...) stays out of it.
    env: pick(process.env, ['PATH', 'HOME', 'LANG'])
  });
}

/**
 * Whether SCRAPER_HEADLESS is on. The SvelteKit env module is only touched when the setting is not
 * given explicitly; outside SvelteKit (scripts) the plain environment variable is read.
 */
export async function isHeadless(): Promise<boolean> {
  try {
    return (await import('./config')).getScraperConfig().headless;
  } catch {
    return /^(1|true|yes)$/i.test(process.env.SCRAPER_HEADLESS ?? '');
  }
}

function pick(env: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function registerExitHooks(): void {
  if (slot[EXIT_HOOKS_KEY]) return;
  slot[EXIT_HOOKS_KEY] = true;
  const close = () => {
    void closeBrowserContext();
  };
  process.once('exit', close);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void closeBrowserContext().finally(() => process.exit());
    });
  }
}

/**
 * Returns the one persistent Chrome context of the process, launched on first use. Keeping it
 * alive across searches keeps the Cloudflare clearance and Discogs cookies between them.
 */
export function getBrowserContext(options: BrowserOptions = {}): Promise<BrowserContext> {
  if (!slot[CONTEXT_KEY]) {
    registerExitHooks();
    const promise = launch(options);
    slot[CONTEXT_KEY] = promise;
    promise.then(
      (context) => {
        // A context that dies (Chrome crash, window closed by the user) must be relaunched next time.
        context.on('close', () => {
          if (slot[CONTEXT_KEY] === promise) delete slot[CONTEXT_KEY];
        });
      },
      () => {
        // A failed launch must not poison every later call.
        if (slot[CONTEXT_KEY] === promise) delete slot[CONTEXT_KEY];
      }
    );
  }
  return slot[CONTEXT_KEY];
}

/** Closes the shared context, if any; the next getBrowserContext() launches a new one. */
export async function closeBrowserContext(): Promise<void> {
  const promise = slot[CONTEXT_KEY];
  if (!promise) return;
  delete slot[CONTEXT_KEY];
  try {
    const context = await promise;
    await context.close();
  } catch {
    // Already gone (crashed or closed by hand).
  }
}
