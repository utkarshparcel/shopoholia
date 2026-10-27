/**
 * U014 — near-duplicate manual credit detection (same merchant + amount ±1d).
 */

export type NearDupCreditCandidate = {
  id: string;
  merchant: string;
  balanceCacheMinor: number;
  createdAt?: string | Date | null;
  /** Fallback when createdAt missing — treat as now. */
  updatedAt?: string | Date | null;
};

export type NearDupCreditInput = {
  merchant: string;
  balanceMinor: number;
  /** Window in ms (default 1 day). */
  withinMs?: number;
  now?: Date;
};

const DEFAULT_WITHIN_MS = 86_400_000;

function normMerchant(m: string): string {
  return m.trim().toLowerCase().replace(/\s+/g, " ");
}

function accountTime(a: NearDupCreditCandidate, fallback: Date): Date {
  const raw = a.createdAt ?? a.updatedAt ?? fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Find existing credits that look like a near-duplicate of a manual add.
 * Same merchant (case-insensitive) + same balanceMinor, created within ±withinMs of now.
 */
export function findNearDuplicateCredits<T extends NearDupCreditCandidate>(
  accounts: T[],
  input: NearDupCreditInput,
): T[] {
  const merchant = normMerchant(input.merchant);
  if (!merchant || input.balanceMinor < 0) return [];
  const withinMs = input.withinMs ?? DEFAULT_WITHIN_MS;
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  return accounts.filter((a) => {
    if (normMerchant(a.merchant) !== merchant) return false;
    if (a.balanceCacheMinor !== input.balanceMinor) return false;
    const t = accountTime(a, now).getTime();
    return Math.abs(t - nowMs) <= withinMs;
  });
}

export function nearDuplicateWarnCopy(existingMerchant: string): string {
  return `You may already have a ${existingMerchant.trim()} credit with this balance from the last day. Open existing or add anyway?`;
}
