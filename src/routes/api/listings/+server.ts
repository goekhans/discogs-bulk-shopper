import { json } from '@sveltejs/kit';
import { DEFAULT_SHIP_TO } from '$app/env/private';
import type { RequestHandler } from './$types';
import { getListings, readListingsSnapshot } from '#lib/server/scraper/index.js';
import { getJobRegistry } from '#lib/server/scraper/jobs.js';

/** GET /api/listings?shipTo=DK — summary of the cached snapshot, 404 when there is none. */
export const GET: RequestHandler = async ({ url }) => {
  const shipTo = url.searchParams.get('shipTo') || DEFAULT_SHIP_TO;
  const snapshot = await readListingsSnapshot(shipTo);
  if (!snapshot) return json({ error: 'no-listings' }, { status: 404 });
  const { count, fetchedAt, stale } = snapshot;
  return json({ count, fetchedAt, shipTo: snapshot.shipTo, requestedShipTo: shipTo, stale });
};

/** POST /api/listings { shipTo?, force? } — starts a scrape in the background. */
export const POST: RequestHandler = async ({ request }) => {
  let body: { shipTo?: unknown; force?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // An empty body means defaults.
  }
  const shipTo =
    typeof body.shipTo === 'string' && body.shipTo.trim() ? body.shipTo : DEFAULT_SHIP_TO;
  const force = body.force === true;

  const started = getJobRegistry().start((report) =>
    getListings({ shipTo, force, onProgress: report })
  );
  if (!started) return json({ error: 'already-running' }, { status: 409 });
  return json({ started: true }, { status: 202 });
};
