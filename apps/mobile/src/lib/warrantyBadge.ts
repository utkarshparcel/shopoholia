import { expiryBadge } from './expiryBadge';

export type WarrantyBadge = {
  tone: 'expired' | 'soon' | 'ok' | 'claimed';
  label: string;
};

/**
 * Pure helper for rendering a warranty's coverage state in the Vault.
 *  - CLAIMED warranties show a neutral "Claimed" badge regardless of date.
 *  - Otherwise reuse the shared expiry window (expired / expires soon / ok).
 */
export function warrantyBadge(
  warranty: { coverageUntil: string | null; state: string },
  now: Date = new Date(),
): WarrantyBadge {
  if (warranty.state === 'CLAIMED') {
    return { tone: 'claimed', label: 'Claimed' };
  }
  const exp = expiryBadge(warranty.coverageUntil, now);
  if (exp === 'expired') return { tone: 'expired', label: 'Expired' };
  if (exp === 'soon') return { tone: 'soon', label: 'Expires soon' };
  return { tone: 'ok', label: 'Covered' };
}
