/**
 * Live smoke check of the scraper, outside the test suite:
 *   npx tsx scripts/scrape-smoke.ts 249504 1180898
 * Launches the shared Chrome profile (a window appears unless SCRAPER_HEADLESS=1), prints the
 * session state (username masked) with the ship-to destination it detected, then scrapes the
 * given release IDs and prints the count and three mapped listings with seller names masked.
 */
import { closeBrowserContext, getBrowserContext } from '#lib/server/scraper/browser.js';
import { fetchListings } from '#lib/server/scraper/listings.js';
import { getSession } from '#lib/server/scraper/session.js';

const releaseIds = process.argv.slice(2).map(Number).filter(Number.isInteger);
if (!releaseIds.length) {
  console.error('Usage: npx tsx scripts/scrape-smoke.ts <releaseId...>');
  process.exit(1);
}

const mask = (name: string) => `${name.slice(0, 2)}***`;

try {
  await getBrowserContext();
  const session = await getSession();
  console.log('session:', { ...session, username: session.username && mask(session.username) });
  console.log(
    'ships to:',
    session.shipTo ? `${session.shipTo.code} (${session.shipTo.name})` : 'unknown (logged out)'
  );
  const started = Date.now();
  const listings = await fetchListings(releaseIds, {
    onProgress: (p) =>
      console.log(`page ${p.pagesDone} (chunk ${p.chunk}/${p.chunks}): ${p.itemsSoFar}/${p.total}`)
  });
  console.log(`\n${listings.length} listings in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const listing of listings.slice(0, 3)) {
    console.log({ ...listing, sellerName: mask(listing.sellerName) });
  }
} finally {
  await closeBrowserContext();
}
