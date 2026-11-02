/**
 * Production domains (worncloset.app). Every share link, public URL and contact address
 * is built from these, so a host change happens here only.
 */

/** Bare website host: share-card watermarks and "shared via …" labels. */
export const WEB_HOST = "worncloset.app";

/** Website (Worn Play at `/`, Worn Closet at `/closet`) and home of all share links (`/r`, `/c`, `/h`, `/p/…`, `/privacy`). */
export const WEB_ORIGIN = `https://${WEB_HOST}`;

/** Worn Closet website: a path on the main site, not a subdomain. */
export const CLOSET_URL = `${WEB_ORIGIN}/closet`;

/** Fastify API. */
export const API_ORIGIN = `https://api.${WEB_HOST}`;

/** Public R2 bucket (catalog images, renders, brand assets). */
export const MEDIA_ORIGIN = `https://media.${WEB_HOST}`;

/** Public privacy policy page. */
export const WEB_PRIVACY_URL = `${WEB_ORIGIN}/privacy`;

/** General contact address. */
export const SUPPORT_EMAIL = `hello@${WEB_HOST}`;

/** Privacy / data-protection contact address. */
export const PRIVACY_EMAIL = `privacy@${WEB_HOST}`;
