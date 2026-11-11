import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getListings, readListingsSnapshot, UNKNOWN_SHIP_TO } from '#lib/server/scraper/index.js';
import { getJobRegistry } from '#lib/server/scraper/jobs.js';
import { ScrapeError } from '#lib/server/scraper/listings.js';
import { getSession } from '#lib/server/scraper/session.js';

/**
 * GET /api/listings?shipTo=DK — summary of the cached snapshot for a destination (default: the
 * ship-to country of the current Discogs session), 404 when there is none.
 */
export const GET: RequestHandler = async ({ url }) => {
  let shipTo = url.searchParams.get('shipTo')?.trim() || null;
  if (!shipTo) {
    try {
      shipTo = (await getSession()).shipTo?.code ?? UNKNOWN_SHIP_TO;
    } catch (err) {
      if (err instanceof ScrapeError) {
        return json({ error: 'scrape', message: err.message }, { status: 500 });
      }
      throw err;
    }
  }
  const snapshot = await readListingsSnapshot(shipTo);
  if (!snapshot) return json({ error: 'no-listings' }, { status: 404 });
  const { count, fetchedAt, shipToName, loggedIn, stale } = snapshot;
  return json({ count, fetchedAt, shipTo: snapshot.shipTo, shipToName, loggedIn, stale });
};

/** POST /api/listings { force? } — starts a scrape in the background. */
export const POST: RequestHandler = async ({ request }) => {
  let body: { force?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body means defaults.
  }
  const force = body.force === true;

  const started = getJobRegistry().start((report) => getListings({ force, onProgress: report }));
  if (!started) return json({ error: 'already-running' }, { status: 409 });
  return json({ started: true }, { status: 202 });
};
