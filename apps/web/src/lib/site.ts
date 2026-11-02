/**
 * Where each site lives. Worn Play is the root of worncloset.app; Worn Closet is its own subdomain,
 * served from this same app (src/middleware.ts maps the closet host onto /closet).
 * Locally the closet site is http://closet.localhost:3001 (browsers send *.localhost to this machine).
 */
const dev = process.env.NODE_ENV === 'development';

function origin(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

export const PLAY_URL = origin(
  process.env.NEXT_PUBLIC_PLAY_URL,
  dev ? 'http://localhost:3001' : 'https://worncloset.app',
);

export const CLOSET_URL = origin(
  process.env.NEXT_PUBLIC_CLOSET_URL,
  dev ? 'http://closet.localhost:3001' : 'https://closet.worncloset.app',
);

export const CONTACT_EMAIL = 'hello@worncloset.app';

/** A link to a place on the Closet site, e.g. closetHref('#vault'). */
export function closetHref(hash = ''): string {
  return `${CLOSET_URL}/${hash}`;
}

/** A link to a place on the Play site, e.g. playHref('#download'). */
export function playHref(hash = ''): string {
  return `${PLAY_URL}/${hash}`;
}

export function hostOf(url: string): string {
  return new URL(url).host;
}
