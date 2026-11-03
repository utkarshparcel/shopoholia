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
export const PRIVACY_EMAIL = 'privacy@worncloset.app';

/** The app and the store listings link to these (packages/shared/src/domains.ts: WEB_PRIVACY_URL). */
export const PRIVACY_PATH = '/privacy';
export const SUPPORT_PATH = '/support';

/** A link to a place on the Closet page, e.g. closetHref('#vault'). */
export function closetHref(hash = ''): string {
  return `${CLOSET_PATH}${hash}`;
}

/**
 * The Google Apps Script web app that adds waitlist sign-ups to a Sheet (see waitlist/README.md).
 * Unset, the sign-up buttons fall back to an email to CONTACT_EMAIL.
 */
export const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL?.trim() || '';

/**
 * Store links for Worn Play, read at build time like the waitlist URL. Unset (today), the site says
 * "coming to iPhone and Android" and asks for an email. Set one or both and the site says "download"
 * and shows that store's button; the list stays only while one platform isn't out yet.
 */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || '';
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || '';
/** Worn Play can be downloaded somewhere. */
export const APP_LIVE = Boolean(APP_STORE_URL || PLAY_STORE_URL);
/** Worn Play can be downloaded on both platforms, so nobody needs the list. */
export const APP_EVERYWHERE = Boolean(APP_STORE_URL && PLAY_STORE_URL);
/** Where it can be downloaded, for copy: "iPhone and Android", "iPhone" or "Android". */
export const LIVE_PLATFORMS = [APP_STORE_URL ? 'iPhone' : '', PLAY_STORE_URL ? 'Android' : ''].filter(Boolean).join(' and ');
/** The label of the button that takes a visitor to the app (or to the list while it isn't out). */
export const GET_APP_LABEL = APP_LIVE ? 'Get the app' : 'Get early access';
/** The same, where the page asks instead of offering. */
export const REQUEST_APP_LABEL = APP_LIVE ? 'Get the app' : 'Request early access';
