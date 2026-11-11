import { SCRAPER_HEADLESS } from '$app/env/private';

export interface ScraperConfig {
  headless: boolean;
}

/**
 * Scraper settings from the environment. The env is injectable so tests and scripts can avoid
 * SvelteKit modules; this is the only scraper module importing `$app/env/private`.
 */
export function getScraperConfig(
  env: { SCRAPER_HEADLESS?: boolean } = { SCRAPER_HEADLESS }
): ScraperConfig {
  return { headless: env.SCRAPER_HEADLESS ?? false };
}
