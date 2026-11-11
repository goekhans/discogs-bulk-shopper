import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ScrapeError } from '#lib/server/scraper/listings.js';
import { openLogin } from '#lib/server/scraper/session.js';

/** One login at a time per process; kept on globalThis so dev-server reloads share the flag. */
const LOGIN_KEY = Symbol.for('discogs-bulk-shopper.loginInProgress');
const slot = globalThis as { [LOGIN_KEY]?: boolean };

/**
 * POST /api/session/login — opens the Discogs login page in the headful Chrome window and waits
 * for the owner to log in there. The password never passes through this app.
 */
export const POST: RequestHandler = async () => {
  if (slot[LOGIN_KEY]) return json({ error: 'already-running' }, { status: 409 });
  slot[LOGIN_KEY] = true;
  try {
    return json(await openLogin({}));
  } catch (err) {
    if (err instanceof ScrapeError) {
      return json({ error: 'scrape', message: err.message }, { status: 500 });
    }
    throw err;
  } finally {
    slot[LOGIN_KEY] = false;
  }
};
