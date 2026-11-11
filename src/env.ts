import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Trims the value and treats an empty or missing variable as undefined, so a missing variable
 * does not break the dev server at startup; getConfig() reports it when a request needs it.
 */
const optional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const variables = defineEnvVars({
  DISCOGS_USERNAME: {
    schema: optional,
    description: 'Discogs username whose wantlist is shopped.'
  },
  DISCOGS_TOKEN: {
    schema: optional,
    description: 'Discogs personal access token. Never log or return it.'
  },
  DEFAULT_SHIP_TO: {
    schema: (value) => optional(value) ?? 'DK',
    description: 'ISO 3166-1 alpha-2 country sellers ship to.'
  },
  DEFAULT_CURRENCY: {
    schema: (value) => optional(value) ?? 'DKK',
    description: 'ISO 4217 currency used for totals.'
  }
});
