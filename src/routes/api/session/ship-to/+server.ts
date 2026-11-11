import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ScrapeError } from '#lib/server/scraper/listings.js';
import { openShipToSettings } from '#lib/server/scraper/session.js';

/** One settings tab at a time per process; on globalThis so dev-server reloads share the flag. */
const OPEN_KEY = Symbol.for('discogs-bulk-shopper.shipToSettingsOpen');
const slot = globalThis as { [OPEN_KEY]?: boolean };

/**
 * POST /api/session/ship-to — opens the Discogs buyer settings in the headful Chrome window so
 * the owner can change the shipping country there, and returns the session state once the tab is
 * closed (or after 5 min). The app never touches the form itself.
 */
export const POST: RequestHandler = async () => {
  if (slot[OPEN_KEY]) return json({ error: 'already-running' }, { status: 409 });
  slot[OPEN_KEY] = true;
  try {
    return json(await openShipToSettings({}));
  } catch (err) {
    if (err instanceof ScrapeError) {
      return json({ error: 'scrape', message: err.message }, { status: 500 });
    }
    throw err;
  } finally {
    slot[OPEN_KEY] = false;
  }
};
