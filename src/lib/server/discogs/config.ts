import { DISCOGS_TOKEN, DISCOGS_USERNAME } from '$app/env/private';

export interface DiscogsConfig {
  username: string;
  token: string;
}

/** Thrown when a required environment variable is missing. The message names the variable. */
export class ConfigError extends Error {
  readonly variable: string;

  constructor(variable: string) {
    super(`Missing ${variable} in .env`);
    this.name = 'ConfigError';
    this.variable = variable;
  }
}

export type EnvValues = Record<'DISCOGS_USERNAME' | 'DISCOGS_TOKEN', string | undefined>;

/**
 * Returns the Discogs credentials from the environment, throwing a ConfigError at request time
 * (not at startup) when one is missing. The env is injectable so tests can avoid SvelteKit modules.
 */
export function getConfig(env: EnvValues = { DISCOGS_USERNAME, DISCOGS_TOKEN }): DiscogsConfig {
  const username = env.DISCOGS_USERNAME?.trim();
  if (!username) throw new ConfigError('DISCOGS_USERNAME');
  const token = env.DISCOGS_TOKEN?.trim();
  if (!token) throw new ConfigError('DISCOGS_TOKEN');
  return { username, token };
}
