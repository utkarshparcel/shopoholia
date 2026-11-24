/**
 * Mobile feature flags.
 *
 * Pattern mirrors the existing env-gated controls in the app
 * (see src/lib/sentry.ts, src/lib/devAuth.ts): a build/runtime env var
 * flips the feature on. Set EXPO_PUBLIC_FEATURE_CLOSET=1 to enable the
 * second (Closet) surface.
 */

export const FEATURE_CLOSET = process.env.EXPO_PUBLIC_FEATURE_CLOSET === '1';

/**
 * Affiliate cashback (coins back for a partner purchase). Off until the partner affiliate
 * accounts exist: without them no purchase is ever attributed, so the app must not promise
 * coins back, list a Cashback screen, or record "Buy for real" taps as pending cashback.
 * Set EXPO_PUBLIC_FEATURE_CASHBACK=1 to switch it all back on.
 */
export const FEATURE_CASHBACK = process.env.EXPO_PUBLIC_FEATURE_CASHBACK === '1';

/** Show the Closet paywall / trial CTA (App Store / Google Play subscriptions). */
export const FEATURE_PAYWALL = process.env.EXPO_PUBLIC_FEATURE_PAYWALL === '1';

/** When on, Accountant + Outfits require an active entitlement. */
export const FEATURE_PREMIUM_GATES =
  process.env.EXPO_PUBLIC_FEATURE_PREMIUM_GATES === '1';

/** India UPI / Razorpay checkout experiment (stub deep-link; no live keys). */
export const FEATURE_UPI = process.env.EXPO_PUBLIC_FEATURE_UPI === '1';

/** MON-UPI-REGIONAL — India UPI checkout experiment. */
export const EXPERIMENT_UPI_CHECKOUT =
  process.env.EXPO_PUBLIC_EXPERIMENT_UPI_CHECKOUT === '1' || FEATURE_UPI;

export const WORN_REGION = (
  process.env.EXPO_PUBLIC_WORN_REGION ?? 'IN'
).toUpperCase() as 'IN' | 'US' | 'GLOBAL';
