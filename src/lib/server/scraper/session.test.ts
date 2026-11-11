import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countryCode, DISCOGS_COUNTRY_CODES } from './countries';
import { ScrapeError } from './listings';
import {
  getSession,
  invalidateSession,
  openLogin,
  openShipToSettings,
  parseSessionSignal,
  parseShipToSignal,
  readSessionSignal,
  readShipToSignal,
  type SessionContext,
  type SessionDeps,
  type SessionPage,
  type SessionSignal,
  type ShipToSignal
} from './session';

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const CHECKED_AT = new Date(NOW).toISOString();

const loggedOut: SessionSignal = {
  headerFound: true,
  hasLoginLink: true,
  usernameCandidates: { userLinkPath: null, avatarAlt: null }
};

/** The logged-in header as observed on 2026-11-11, anonymised (see docs/ship-to.md). */
const loggedIn: SessionSignal = {
  headerFound: true,
  hasLoginLink: false,
  usernameCandidates: { userLinkPath: '/user/example_user', avatarAlt: 'example_user' }
};

/** The buyer settings page as observed on 2026-11-11: `select#country` holds a country name. */
const denmark: ShipToSignal = { settingsFound: true, country: 'Denmark' };
const noSettings: ShipToSignal = { settingsFound: false, country: null };

type Signal = SessionSignal | ShipToSignal;

/**
 * A fake page whose evaluate() answers with the header signal or, after a navigation to the buyer
 * settings page, the ship-to signal the test controls.
 */
function fakePage(signal: () => SessionSignal | Error, shipTo: () => ShipToSignal = () => denmark) {
  const page: SessionPage & { closed: boolean; front: boolean; url: string } = {
    closed: false,
    front: false,
    url: '',
    goto: vi.fn(async (url: string) => {
      page.url = url;
    }),
    waitForLoadState: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: () => Signal) => {
      if (fn === readShipToSignal) {
        return page.url.includes('/settings/buyer') ? shipTo() : noSettings;
      }
      const result = signal();
      if (result instanceof Error) throw result;
      return result;
    }) as SessionPage['evaluate'],
    bringToFront: vi.fn(async () => {
      page.front = true;
    }),
    isClosed: () => page.closed,
    close: vi.fn(async () => {
      page.closed = true;
    })
  };
  return page;
}

function fakeContext(page: SessionPage): SessionContext {
  return {
    newPage: vi.fn(async () => page),
    cookies: vi.fn(async () => [{ name: 'cf_clearance' }, { name: '__cf_bm' }])
  };
}

function deps(page: SessionPage, extra: Partial<SessionDeps> = {}): Partial<SessionDeps> {
  return {
    context: async () => fakeContext(page),
    headless: async () => false,
    now: () => NOW,
    sleep: async () => undefined,
    ...extra
  };
}

/** Deps on vitest's fake clock, for the functions that poll. */
function clockDeps(page: SessionPage, extra: Partial<SessionDeps> = {}): Partial<SessionDeps> {
  return deps(page, {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...extra
  });
}

beforeEach(() => invalidateSession());

describe('DISCOGS_COUNTRY_CODES', () => {
  it('holds only current two-letter ISO codes', () => {
    for (const [name, code] of Object.entries(DISCOGS_COUNTRY_CODES)) {
      expect(code, name).toMatch(/^[A-Z]{2}$/);
    }
    expect(DISCOGS_COUNTRY_CODES['Benin']).toBe('BJ');
    expect(DISCOGS_COUNTRY_CODES['Burkina Faso']).toBe('BF');
    expect(DISCOGS_COUNTRY_CODES['Germany']).toBe('DE');
    expect(DISCOGS_COUNTRY_CODES['United States']).toBe('US');
    expect(Object.values(DISCOGS_COUNTRY_CODES)).not.toContain('DY');
    expect(Object.values(DISCOGS_COUNTRY_CODES)).not.toContain('HV');
  });
});

describe('countryCode', () => {
  it('maps the Discogs country names to ISO 3166-1 alpha-2', () => {
    expect(countryCode('Denmark')).toEqual({ code: 'DK', name: 'Denmark' });
    expect(countryCode('Sweden').code).toBe('SE');
    expect(countryCode('United Kingdom').code).toBe('GB');
    expect(countryCode('United States').code).toBe('US');
    expect(countryCode('Russian Federation').code).toBe('RU');
    expect(countryCode('Czech Republic').code).toBe('CZ');
    expect(countryCode(' germany ').code).toBe('DE');
  });

  it('keeps an unknown name with the code "unknown"', () => {
    expect(countryCode('Former USSR')).toEqual({ code: 'unknown', name: 'Former USSR' });
  });

  it('only holds two-letter upper-case codes', () => {
    for (const code of Object.values(DISCOGS_COUNTRY_CODES)) expect(code).toMatch(/^[A-Z]{2}$/);
    expect(Object.keys(DISCOGS_COUNTRY_CODES).length).toBeGreaterThan(200);
  });
});

describe('parseSessionSignal', () => {
  it('reports a logged-out header', () => {
    expect(parseSessionSignal(loggedOut, CHECKED_AT)).toEqual({
      loggedIn: false,
      username: null,
      checkedAt: CHECKED_AT
    });
  });

  it('reports a logged-in header with the username from the user link', () => {
    expect(parseSessionSignal(loggedIn, CHECKED_AT)).toEqual({
      loggedIn: true,
      username: 'example_user',
      checkedAt: CHECKED_AT
    });
  });

  it('takes the username from a deeper /user/ link, then from the avatar alt', () => {
    const fromCollection = { userLinkPath: '/user/example_user/collection', avatarAlt: 'other' };
    expect(
      parseSessionSignal({ ...loggedIn, usernameCandidates: fromCollection }, CHECKED_AT).username
    ).toBe('example_user');
    expect(
      parseSessionSignal(
        { ...loggedIn, usernameCandidates: { userLinkPath: null, avatarAlt: 'example_user' } },
        CHECKED_AT
      ).username
    ).toBe('example_user');
  });

  it('is logged in with an unknown username when no candidate is found', () => {
    const signal = { ...loggedIn, usernameCandidates: loggedOut.usernameCandidates };
    expect(parseSessionSignal(signal, CHECKED_AT)).toMatchObject({
      loggedIn: true,
      username: null
    });
  });

  it('never reports a username for a logged-out header', () => {
    const signal = { ...loggedOut, usernameCandidates: loggedIn.usernameCandidates };
    expect(parseSessionSignal(signal, CHECKED_AT).username).toBeNull();
  });

  it('rejects a page without the header (Cloudflare interstitial)', () => {
    expect(() => parseSessionSignal({ ...loggedOut, headerFound: false }, CHECKED_AT)).toThrow(
      ScrapeError
    );
  });
});

describe('parseShipToSignal', () => {
  it('maps the selected country of the buyer settings to its code', () => {
    expect(parseShipToSignal(denmark)).toEqual({ code: 'DK', name: 'Denmark' });
    expect(parseShipToSignal({ settingsFound: true, country: 'Sweden' })).toEqual({
      code: 'SE',
      name: 'Sweden'
    });
  });

  it('keeps a name it does not know', () => {
    expect(parseShipToSignal({ settingsFound: true, country: 'Yugoslavia' })).toEqual({
      code: 'unknown',
      name: 'Yugoslavia'
    });
  });

  it('is null off the settings page (login redirect) or with nothing selected', () => {
    expect(parseShipToSignal(noSettings)).toBeNull();
    expect(parseShipToSignal({ settingsFound: true, country: null })).toBeNull();
  });
});

describe('readSessionSignal', () => {
  type FakeElement = { attrs?: Record<string, string>; children?: Record<string, FakeElement> };
  /** A minimal DOM: selectors map to elements, `selector, selector` lists match any entry. */
  const element = (node: FakeElement) => ({
    getAttribute: (name: string) => node.attrs?.[name] ?? null,
    querySelector: (selector: string) => {
      const children = node.children ?? {};
      const key = selector.split(', ').find((part) => part in children);
      return key ? element(children[key]) : null;
    }
  });
  const stubHeader = (shadow: FakeElement | null) => {
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector === '#__header_root_astro' && shadow ? { shadowRoot: element(shadow) } : null
    });
    vi.stubGlobal('location', { href: 'https://www.discogs.com/' });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('reads the logged-out shadow header', () => {
    stubHeader({ children: { 'nav.hdr-user': { children: {} }, 'a#log_in_link': {} } });
    expect(readSessionSignal()).toEqual(loggedOut);
  });

  it('reads the logged-in header from the account menu link and avatar', () => {
    stubHeader({
      children: {
        'nav.hdr-user': {
          children: {
            'a[href^="/user/"]': { attrs: { href: '/user/example_user/collection' } },
            'a.login-username': { attrs: { href: '/user/example_user' } },
            'img.login-avatar[alt]': { attrs: { alt: 'example_user' } }
          }
        }
      }
    });
    expect(readSessionSignal()).toEqual(loggedIn);
  });

  it('reports no header on another page', () => {
    stubHeader(null);
    expect(readSessionSignal().headerFound).toBe(false);
  });
});

describe('readShipToSignal', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubSettings = (host: string, pathname: string, option: Record<string, string> | null) => {
    vi.stubGlobal('location', { host, pathname });
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector === 'select#country' && option
          ? {
              querySelector: (inner: string) =>
                inner === 'option:checked'
                  ? {
                      getAttribute: (name: string) => option[name] ?? null,
                      textContent: option.text ?? ''
                    }
                  : null
            }
          : null
    });
  };

  it('reads the selected country of the buyer settings page', () => {
    stubSettings('www.discogs.com', '/settings/buyer', { value: 'Denmark', text: 'Denmark' });
    expect(readShipToSignal()).toEqual(denmark);
  });

  it('falls back to the option text and ignores the placeholder', () => {
    stubSettings('www.discogs.com', '/settings/buyer', { value: '', text: 'Select your country' });
    expect(readShipToSignal()).toEqual({ settingsFound: true, country: 'Select your country' });
    stubSettings('www.discogs.com', '/settings/buyer', null);
    expect(readShipToSignal()).toEqual({ settingsFound: true, country: null });
  });

  it('reports no settings on the login host', () => {
    stubSettings('login.discogs.com', '/u/login', null);
    expect(readShipToSignal()).toEqual(noSettings);
  });
});

describe('getSession', () => {
  it('visits the homepage once when logged out, closes the page and caches for 60 s', async () => {
    const page = fakePage(() => loggedOut);
    let now = NOW;
    const d = deps(page, { now: () => now });

    const state = await getSession({}, d);
    expect(state).toEqual({ loggedIn: false, username: null, shipTo: null, checkedAt: CHECKED_AT });
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith('https://www.discogs.com/', { waitUntil: 'commit' });
    expect(page.closed).toBe(true);

    now += 59_000;
    expect(await getSession({}, d)).toBe(state);
    expect(page.goto).toHaveBeenCalledTimes(1);

    now += 2_000;
    expect(await getSession({}, d)).not.toBe(state);
    expect(page.goto).toHaveBeenCalledTimes(2);
  });

  it('also visits the buyer settings when logged in and reports the ship-to country', async () => {
    const page = fakePage(() => loggedIn);
    const state = await getSession({}, deps(page));
    expect(state).toEqual({
      loggedIn: true,
      username: 'example_user',
      shipTo: { code: 'DK', name: 'Denmark' },
      checkedAt: CHECKED_AT
    });
    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto).toHaveBeenLastCalledWith('https://www.discogs.com/settings/buyer', {
      waitUntil: 'commit'
    });
    expect(page.closed).toBe(true);
  });

  it('reports no ship-to when the settings page cannot be read in time', async () => {
    const page = fakePage(
      () => loggedIn,
      () => noSettings
    );
    let now = NOW;
    const state = await getSession({}, deps(page, { now: () => (now += 4_000) }));
    expect(state).toMatchObject({ loggedIn: true, shipTo: null });
    expect(page.closed).toBe(true);
  });

  it('bypasses the cache with force', async () => {
    const page = fakePage(() => loggedIn);
    const d = deps(page);
    await getSession({}, d);
    const forced = await getSession({ force: true }, d);
    expect(forced).toMatchObject({ loggedIn: true, username: 'example_user' });
    expect(page.goto).toHaveBeenCalledTimes(4);
  });

  it('closes the page and rejects with a ScrapeError on failure', async () => {
    const page = fakePage(() => new Error('Target closed'));
    let now = NOW;
    const d = deps(page, { now: () => (now += 5_000) });
    await expect(getSession({}, d)).rejects.toThrow(ScrapeError);
    await expect(getSession({}, d)).rejects.toThrow('Could not read the Discogs header');
    expect(page.closed).toBe(true);
  });
});

describe('openLogin', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it('refuses a headless context', async () => {
    const page = fakePage(() => loggedOut);
    await expect(openLogin({}, deps(page, { headless: async () => true }))).rejects.toThrow(
      /SCRAPER_HEADLESS/
    );
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('opens the login page in front, then returns the fresh session once logged in', async () => {
    let signal: SessionSignal | Error = new Error('Execution context was destroyed');
    const page = fakePage(() => signal);
    const d = clockDeps(page);

    const pending = openLogin({ timeoutMs: 60_000 }, d);
    await vi.advanceTimersByTimeAsync(0);
    expect(page.goto).toHaveBeenCalledWith('https://www.discogs.com/login', {
      waitUntil: 'commit'
    });
    expect(page.front).toBe(true);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(page.closed).toBe(false);

    signal = loggedIn;
    await vi.advanceTimersByTimeAsync(2_000);
    const state = await pending;
    expect(state).toMatchObject({
      loggedIn: true,
      username: 'example_user',
      shipTo: { code: 'DK', name: 'Denmark' }
    });
    expect(page.closed).toBe(true);
  });

  it('closes the page and rejects when the login times out', async () => {
    const page = fakePage(() => loggedOut);
    const pending = openLogin({ timeoutMs: 10_000 }, clockDeps(page));
    const outcome = expect(pending).rejects.toThrow('Login timed out');
    await vi.advanceTimersByTimeAsync(12_000);
    await outcome;
    expect(page.closed).toBe(true);
  });
});

describe('openShipToSettings', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it('refuses a headless context', async () => {
    const page = fakePage(() => loggedIn);
    await expect(
      openShipToSettings({}, deps(page, { headless: async () => true }))
    ).rejects.toThrow(/SCRAPER_HEADLESS/);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('opens the buyer settings in front and re-reads the session once the tab is closed', async () => {
    let country = 'Denmark';
    const page = fakePage(
      () => loggedIn,
      () => ({ settingsFound: true, country })
    );
    const pending = openShipToSettings({ timeoutMs: 60_000 }, clockDeps(page));
    await vi.advanceTimersByTimeAsync(0);
    expect(page.goto).toHaveBeenCalledWith('https://www.discogs.com/settings/buyer', {
      waitUntil: 'commit'
    });
    expect(page.front).toBe(true);
    expect(page.evaluate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(page.closed).toBe(false);

    // The owner saves Sweden and closes the tab.
    country = 'Sweden';
    page.closed = true;
    await vi.advanceTimersByTimeAsync(2_000);
    const state = await pending;
    expect(state).toMatchObject({ loggedIn: true, shipTo: { code: 'SE', name: 'Sweden' } });
  });

  it('closes the tab and still returns the session when the timeout elapses', async () => {
    const page = fakePage(() => loggedIn);
    const pending = openShipToSettings({ timeoutMs: 10_000 }, clockDeps(page));
    await vi.advanceTimersByTimeAsync(12_000);
    const state = await pending;
    expect(page.close).toHaveBeenCalled();
    expect(state).toMatchObject({ shipTo: { code: 'DK', name: 'Denmark' } });
  });

  it('invalidates the cached session', async () => {
    const page = fakePage(() => loggedIn);
    const d = clockDeps(page);
    const before = await getSession({}, d);
    const pending = openShipToSettings({ timeoutMs: 1_000 }, d);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).not.toBe(before);
  });
});
