import { json } from '@sveltejs/kit';
import { DEFAULT_CURRENCY } from '$app/env/private';
import type { RequestHandler } from './$types';
import { RatesError, getRates } from '#lib/server/rates.js';

/** GET /api/rates?base=DKK&force=1 — latest exchange rates for a base currency. */
export const GET: RequestHandler = async ({ url }) => {
  const base = url.searchParams.get('base') || DEFAULT_CURRENCY;
  const force = url.searchParams.get('force') === '1';
  try {
    return json(await getRates(base, { force }));
  } catch (err: unknown) {
    if (err instanceof RatesError) {
      return json({ error: 'rates', message: err.message }, { status: 502 });
    }
    throw err;
  }
};
