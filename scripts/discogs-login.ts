/**
 * Logs the scraper's Chrome profile in to Discogs, by hand:
 *   npx tsx scripts/discogs-login.ts
 * Opens the Discogs login page in the shared (headful) profile and waits up to five minutes for
 * you to log in there. The app never asks for, stores or transmits the Discogs password: this
 * script only reads the site header afterwards to report whether the login worked.
 */
import { closeBrowserContext, isHeadless } from '#lib/server/scraper/browser.js';
import { openLogin } from '#lib/server/scraper/session.js';

const mask = (name: string | null) => (name ? `${name.slice(0, 2)}***` : null);

try {
  if (!(await isHeadless()))
    console.log('Log in to Discogs in the Chrome window that just opened…');
  const state = await openLogin({});
  console.log({ loggedIn: state.loggedIn, username: mask(state.username) });
} finally {
  await closeBrowserContext();
}
