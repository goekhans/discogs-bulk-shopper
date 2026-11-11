/**
 * The Discogs session of the scraper's Chrome profile: whether it is logged in, as which user, and
 * which country the buyer settings ship to.
 *
 * Invariant: the app never asks for, stores or transmits the Discogs password. Logging in happens
 * by hand in the headful Chrome window; this module only reads the site header and the selected
 * country of the buyer settings page to tell what state the profile is in. It never reads form
 * fields other than that select, never types into a Discogs form and never reads cookie values
 * (cookie names only, for the Cloudflare wait).
 */
import { countryCode, type ShipTo } from './countries';
import { ScrapeError } from './listings';

export type { ShipTo } from './countries';

export interface SessionState {
  loggedIn: boolean;
  username: string | null;
  /** The shipping-address country of the Discogs buyer settings; null when logged out. */
  shipTo: ShipTo | null;
  checkedAt: string;
}

/** What `readSessionSignal` collects from the header, serialisable for page.evaluate. */
export interface SessionSignal {
  /** The header fragment (and its shadow root) was found; false on a Cloudflare interstitial. */
  headerFound: boolean;
  /** The "Sign Up / Log In" link (`a#log_in_link`) is present: the visitor is logged out. */
  hasLoginLink: boolean;
  /** Candidates for the username of a logged-in header, in order of preference. */
  usernameCandidates: {
    /** Path of the account menu's `a.login-username` link, else the first `/user/<name>` link. */
    userLinkPath: string | null;
    /** `alt` of the account menu's `img.login-avatar`. */
    avatarAlt: string | null;
  };
}

/** What `readShipToSignal` collects from the buyer settings page. */
export interface ShipToSignal {
  /** The page is the buyer settings page on www.discogs.com (not a login redirect). */
  settingsFound: boolean;
  /** The selected option of `select#country` (a country name such as "Denmark"), or null. */
  country: string | null;
}

/** The minimal page surface the session functions use, so tests can pass a fake. */
export interface SessionPage {
  goto(url: string, options?: { waitUntil?: 'commit' | 'domcontentloaded' }): Promise<unknown>;
  waitForLoadState(state?: 'domcontentloaded'): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  bringToFront(): Promise<void>;
  isClosed(): boolean;
  close(): Promise<void>;
}

export interface SessionContext {
  newPage(): Promise<SessionPage>;
  cookies(url: string): Promise<{ name: string }[]>;
}

export interface SessionDeps {
  context: () => Promise<SessionContext>;
  /** Whether the shared context runs without a window (SCRAPER_HEADLESS). */
  headless: () => Promise<boolean>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const HOME_URL = 'https://www.discogs.com/';
export const LOGIN_URL = 'https://www.discogs.com/login';
/** Where the buyer's shipping address (and so the ship-to country) is shown and changed. */
export const BUYER_SETTINGS_URL = 'https://www.discogs.com/settings/buyer';
export const SESSION_TTL_MS = 60_000;
export const LOGIN_POLL_MS = 2_000;
export const SHIP_TO_POLL_MS = 2_000;
/** How long the header may take to appear after navigation (Cloudflare challenge included). */
export const HEADER_WAIT_MS = 15_000;

const CACHE_KEY = Symbol.for('discogs-bulk-shopper.session');

interface CacheEntry {
  state: SessionState;
  at: number;
}

const INFLIGHT_KEY = Symbol.for('discogs-bulk-shopper.session.inflight');
const slot = globalThis as { [CACHE_KEY]?: CacheEntry; [INFLIGHT_KEY]?: Promise<SessionState> };

const defaultDeps: SessionDeps = {
  // Loaded lazily so importing this module never pulls patchright into tests.
  context: async () => (await import('./browser')).getBrowserContext(),
  headless: async () => (await import('./browser')).isHeadless(),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

/**
 * Runs inside the page. The Discogs header is server-rendered into a declarative shadow root under
 * `#__header_root_astro`; logged out it holds `a#log_in_link` ("Sign Up / Log In"), logged in the
 * account menu `div[data-name="account"]` with `a.login-username[href="/user/<name>"]` and
 * `img.login-avatar[alt="<name>"]`. Written without inner function declarations: tsx would wrap
 * those in a `__name` helper the page does not have.
 */
export function readSessionSignal(): SessionSignal {
  const root = document.querySelector('#__header_root_astro');
  const scope: ParentNode | null = root ? (root.shadowRoot ?? root) : null;
  const userNav = scope ? scope.querySelector('nav.hdr-user') : null;
  const userLink = userNav
    ? userNav.querySelector('a.login-username, a[href^="/user/"], a[href*="/user/"]')
    : null;
  const avatar = userNav ? userNav.querySelector('img.login-avatar[alt], img[alt]') : null;
  return {
    headerFound: !!scope && !!(userNav ?? scope.querySelector('nav.hdr-main')),
    hasLoginLink: !!scope && !!scope.querySelector('a#log_in_link'),
    usernameCandidates: {
      userLinkPath: userLink
        ? new URL(userLink.getAttribute('href') ?? '', location.href).pathname
        : null,
      avatarAlt: avatar ? avatar.getAttribute('alt') : null
    }
  };
}

/**
 * Runs inside the buyer settings page: the ship-to country is the selected option of
 * `select#country` in `form#buyer-address-form`, as a name ("Denmark"). Logged out, the URL
 * redirects to the Auth0 login host, where there is no such select.
 */
export function readShipToSignal(): ShipToSignal {
  const select = document.querySelector('select#country') as HTMLSelectElement | null;
  const selected = select ? select.querySelector('option:checked') : null;
  const value = selected ? selected.getAttribute('value') || selected.textContent : null;
  return {
    settingsFound: location.host === 'www.discogs.com' && location.pathname === '/settings/buyer',
    country: value ? value.trim() || null : null
  };
}

/** Turns the raw header signal into the session state; pure, for unit tests with fixtures. */
export function parseSessionSignal(
  signal: SessionSignal,
  checkedAt: string
): Pick<SessionState, 'loggedIn' | 'username' | 'checkedAt'> {
  if (!signal.headerFound) throw new ScrapeError('Could not read the Discogs header', HOME_URL);
  const loggedIn = !signal.hasLoginLink;
  const { userLinkPath, avatarAlt } = signal.usernameCandidates;
  const fromLink = userLinkPath ? /\/user\/([^/?#]+)/.exec(userLinkPath)?.[1] : null;
  const username = loggedIn ? fromLink?.trim() || avatarAlt?.trim() || null : null;
  return { loggedIn, username: username ? decodeURIComponent(username) : null, checkedAt };
}

/** Turns the settings-page signal into the ship-to destination, or null when it is not there. */
export function parseShipToSignal(signal: ShipToSignal): ShipTo | null {
  if (!signal.settingsFound || !signal.country) return null;
  return countryCode(signal.country);
}

/** Waits for the Cloudflare clearance the way discogs-marketplace-api-nodejs does: by cookie name. */
async function waitForClearance(
  context: SessionContext,
  sleep: SessionDeps['sleep']
): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const cookies = await context.cookies(HOME_URL);
    if (cookies.some((cookie) => cookie.name === 'cf_clearance')) return;
    await sleep(100);
  }
}

const emptySessionSignal = (): SessionSignal => ({
  headerFound: false,
  hasLoginLink: false,
  usernameCandidates: { userLinkPath: null, avatarAlt: null }
});

/**
 * Evaluates `read` on the page it is on until `ready` accepts the result or the wait elapses,
 * retrying while a challenge page or a navigation is in the way.
 */
async function readUntil<T>(
  page: SessionPage,
  d: SessionDeps,
  waitMs: number,
  read: () => T,
  ready: (value: T) => boolean,
  fallback: () => T
): Promise<T> {
  const deadline = d.now() + waitMs;
  let value: T | undefined;
  do {
    try {
      value = await page.evaluate(read);
    } catch {
      // Mid-navigation: the execution context was destroyed. Try again.
    }
    if (value !== undefined && ready(value)) return value;
    await d.sleep(500);
  } while (d.now() < deadline);
  return value ?? fallback();
}

function toScrapeError(err: unknown, url: string): ScrapeError {
  if (err instanceof ScrapeError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ScrapeError(`Reading the Discogs session failed: ${message}`, url, err);
}

export function invalidateSession(): void {
  delete slot[CACHE_KEY];
}

/**
 * The session state of the shared Chrome profile, cached for 60 s unless `force` is set: one
 * visit to the Discogs homepage for the header and, when logged in, one to the buyer settings
 * page for the ship-to country. The page is always closed again, even on failure.
 */
export async function getSession(
  { force = false }: { force?: boolean } = {},
  deps: Partial<SessionDeps> = {}
): Promise<SessionState> {
  const d: SessionDeps = { ...defaultDeps, ...deps };
  const cached = slot[CACHE_KEY];
  if (!force && cached && d.now() - cached.at < SESSION_TTL_MS) return cached.state;
  // Concurrent callers (a listings GET plus a scrape job, say) share one page visit.
  if (!force && slot[INFLIGHT_KEY]) return slot[INFLIGHT_KEY];
  const inflight = readSession(d).finally(() => {
    if (slot[INFLIGHT_KEY] === inflight) delete slot[INFLIGHT_KEY];
  });
  slot[INFLIGHT_KEY] = inflight;
  return inflight;
}

async function readSession(d: SessionDeps): Promise<SessionState> {
  let page: SessionPage | null = null;
  let url = HOME_URL;
  try {
    const context = await d.context();
    page = await context.newPage();
    await page.goto(HOME_URL, { waitUntil: 'commit' });
    await waitForClearance(context, d.sleep);
    await page.waitForLoadState('domcontentloaded');
    const signal = await readUntil(
      page,
      d,
      HEADER_WAIT_MS,
      readSessionSignal,
      (s) => s.headerFound,
      emptySessionSignal
    );
    const checkedAt = new Date(d.now()).toISOString();
    const header = parseSessionSignal(signal, checkedAt);

    let shipTo: ShipTo | null = null;
    if (header.loggedIn) {
      url = BUYER_SETTINGS_URL;
      await page.goto(BUYER_SETTINGS_URL, { waitUntil: 'commit' });
      await page.waitForLoadState('domcontentloaded');
      const shipToSignal = await readUntil(
        page,
        d,
        HEADER_WAIT_MS,
        readShipToSignal,
        (s) => s.settingsFound && !!s.country,
        () => ({ settingsFound: false, country: null })
      );
      shipTo = parseShipToSignal(shipToSignal);
    }

    const state: SessionState = { ...header, shipTo };
    slot[CACHE_KEY] = { state, at: d.now() };
    return state;
  } catch (err) {
    throw toScrapeError(err, url);
  } finally {
    await page?.close().catch(() => undefined);
  }
}

async function requireWindow(d: SessionDeps, what: string, url: string): Promise<void> {
  if (await d.headless()) {
    throw new ScrapeError(
      `${what} needs a visible Chrome window: unset SCRAPER_HEADLESS and restart`,
      url
    );
  }
}

/**
 * Opens the Discogs login page in a new tab of the (headful) shared context and waits for the owner
 * to log in there by hand, polling the header of the tab every 2 s. Nothing is typed, read from the
 * form or taken from cookies. Resolves with the fresh session state, or rejects on timeout.
 */
export async function openLogin(
  { timeoutMs = 5 * 60_000 }: { timeoutMs?: number } = {},
  deps: Partial<SessionDeps> = {}
): Promise<SessionState> {
  const d: SessionDeps = { ...defaultDeps, ...deps };
  await requireWindow(d, 'Logging in', LOGIN_URL);

  let page: SessionPage | null = null;
  try {
    const context = await d.context();
    page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'commit' });
    await page.bringToFront();

    const deadline = d.now() + timeoutMs;
    while (d.now() < deadline) {
      // On the Auth0 login page there is no Discogs header, so the signal is "not found" until the
      // post-login redirect lands back on www.discogs.com.
      if (page.isClosed()) throw new ScrapeError('Login window closed', LOGIN_URL);
      let loggedIn = false;
      try {
        const signal = await page.evaluate(readSessionSignal);
        loggedIn = signal.headerFound && !signal.hasLoginLink;
      } catch {
        // Mid-navigation; poll again.
      }
      if (loggedIn) {
        invalidateSession();
        await page.close();
        page = null;
        return await getSession({ force: true }, deps);
      }
      await d.sleep(LOGIN_POLL_MS);
    }
    throw new ScrapeError('Login timed out', LOGIN_URL);
  } catch (err) {
    throw toScrapeError(err, LOGIN_URL);
  } finally {
    await page?.close().catch(() => undefined);
  }
}

/**
 * Opens the Discogs buyer settings page in a new tab of the (headful) shared context, in front, so
 * the owner can change the shipping address country there by hand. Resolves once the owner closes
 * the tab or the timeout elapses (polled every 2 s), with the session state read afresh. Nothing
 * on the page is typed or submitted by the app.
 */
export async function openShipToSettings(
  { timeoutMs = 5 * 60_000 }: { timeoutMs?: number } = {},
  deps: Partial<SessionDeps> = {}
): Promise<SessionState> {
  const d: SessionDeps = { ...defaultDeps, ...deps };
  await requireWindow(d, 'Changing the ship-to country', BUYER_SETTINGS_URL);

  let page: SessionPage | null = null;
  try {
    const context = await d.context();
    page = await context.newPage();
    await page.goto(BUYER_SETTINGS_URL, { waitUntil: 'commit' });
    await page.bringToFront();

    const deadline = d.now() + timeoutMs;
    while (!page.isClosed() && d.now() < deadline) {
      await d.sleep(SHIP_TO_POLL_MS);
    }
    if (!page.isClosed()) await page.close();
    page = null;
    invalidateSession();
    return await getSession({ force: true }, deps);
  } catch (err) {
    throw toScrapeError(err, BUYER_SETTINGS_URL);
  } finally {
    await page?.close().catch(() => undefined);
  }
}
