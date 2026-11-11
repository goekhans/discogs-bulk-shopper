import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ScrapeError } from '#lib/server/scraper/listings.js';
import { getSession } from '#lib/server/scraper/session.js';

/** GET /api/session?force=1 — whether the scraper's Chrome profile is logged in to Discogs. */
export const GET: RequestHandler = async ({ url }) => {
  const force = url.searchParams.get('force') === '1';
  try {
    return json(await getSession({ force }));
  } catch (err) {
    if (err instanceof ScrapeError) {
      return json({ error: 'scrape', message: err.message }, { status: 500 });
    }
    throw err;
  }
};
