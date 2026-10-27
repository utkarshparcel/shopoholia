export type ExpiryState = "expired" | "soon" | "ok";

const SOON_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pure helper classifying a credit's expiry for badge rendering.
 *  - "expired": expiresAt is in the past
 *  - "soon": expires within 14 days (inclusive)
 *  - "ok": more than 14 days out, or no expiry
 */
export function expiryBadge(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryState {
  if (!expiresAt) return "ok";
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return "ok";
  const diff = exp - now.getTime();
  if (diff <= 0) return "expired";
  if (diff <= SOON_WINDOW_MS) return "soon";
  return "ok";
}
