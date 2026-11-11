import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DiscogsApiError } from '#lib/server/discogs/api.js';
import { ConfigError } from '#lib/server/discogs/config.js';
import { getWantlist } from '#lib/server/discogs/wantlist.js';

/** GET /api/wantlist?force=1 — the cached wantlist; force=1 refetches from Discogs. */
export const GET: RequestHandler = async ({ url }) => {
  const force = url.searchParams.get('force') === '1';
  try {
    const { items, fetchedAt } = await getWantlist({ force });
    return json({ items, fetchedAt, count: items.length });
  } catch (err: unknown) {
    if (err instanceof ConfigError) {
      return json({ error: 'config', message: err.message }, { status: 500 });
    }
    if (err instanceof DiscogsApiError) {
      return json({ error: 'discogs', status: err.status, message: err.message }, { status: 502 });
    }
    throw err;
  }
};
