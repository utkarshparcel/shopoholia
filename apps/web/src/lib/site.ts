/**
 * Where the site lives: Worn Play at the root of worncloset.app, Worn Closet at /closet.
 * Page links use the paths; the full URLs are for metadata, sitemaps and share cards.
 */
const dev = process.env.NODE_ENV === 'development';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || (dev ? 'http://localhost:3001' : 'https://worncloset.app')
).replace(/\/+$/, '');

export const CLOSET_PATH = '/closet';
export const CLOSET_URL = `${SITE_URL}${CLOSET_PATH}`;

export const CONTACT_EMAIL = 'hello@worncloset.app';

/** A link to a place on the Closet page, e.g. closetHref('#vault'). */
export function closetHref(hash = ''): string {
  return `${CLOSET_PATH}${hash}`;
}
