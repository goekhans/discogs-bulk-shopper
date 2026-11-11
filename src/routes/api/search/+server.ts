import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runSearch } from './search';

/**
 * POST /api/search — ranks sellers for the wantlist against the cached listings snapshot.
 * Body: SearchParams (every field optional) plus an optional `shipTo` picking the snapshot;
 * without it the most recently fetched snapshot is used. Never scrapes or opens Chrome.
 */
export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid-json' }, { status: 400 });
  }
  const outcome = await runSearch(body);
  return json(outcome.body, { status: outcome.status });
};
