/**
 * U006 — Cashback claim deadline helpers (sort + claim-start URL).
 * Manual tracker only — not a bank/card partner or auto-filer.
 */

const CLAIM_URL_LINE = /^claimUrl=(https?:\/\/\S+)$/im;

/** Encode optional claim portal URL into notes without a schema migration. */
export function encodeCashbackClaimNotes(
  notes: string | null | undefined,
  claimUrl: string | null | undefined,
): string | null {
  const cleanNotes = (notes ?? "").replace(CLAIM_URL_LINE, "").trim();
  const url = claimUrl?.trim() || null;
  if (!url && !cleanNotes) return null;
  if (!url) return cleanNotes;
  if (!cleanNotes) return `claimUrl=${url}`;
  return `claimUrl=${url}\n${cleanNotes}`;
}

export function extractCashbackClaimUrl(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(CLAIM_URL_LINE);
  return m?.[1] ?? null;
}

export function stripCashbackClaimUrlFromNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes) return null;
  const stripped = notes.replace(CLAIM_URL_LINE, "").trim();
  return stripped || null;
}

/** Sort unclaimed-first by claim-before date (soonest first); nulls last. */
export function compareCashbackClaimsByDeadline(
  a: { expiresAt: Date | string | null; createdAt: Date | string },
  b: { expiresAt: Date | string | null; createdAt: Date | string },
): number {
  const aExp = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  const bExp = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  if (aExp !== bExp) return aExp - bExp;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Soft claim-start URL: explicit claimUrl wins; else well-known reward portals
 * by source keyword. Never implies WORN partners with the bank.
 */
export function cashbackClaimStartUrl(
  source: string,
  claimUrl?: string | null,
): string | null {
  if (claimUrl?.trim()) return claimUrl.trim();
  const key = source.trim().toLowerCase();
  if (!key) return null;
  if (/\bhdfc\b/.test(key)) return "https://www.hdfcbank.com/";
  if (/\baxis\b/.test(key)) return "https://www.axisbank.com/";
  if (/\bicici\b/.test(key)) return "https://www.icicibank.com/";
  if (/\bsbi\b|\bstate bank\b/.test(key)) return "https://www.onlinesbi.sbi/";
  if (/\bamex\b|\bamerican express\b/.test(key)) {
    return "https://www.americanexpress.com/";
  }
  return null;
}

/** Lead time for claim-deadline push (T-3d). */
export const CASHBACK_CLAIM_LEAD_MS = 3 * 86_400_000;

export function cashbackClaimReminderJobId(claimId: string): string {
  return `cashback-claim-deadline:${claimId}`;
}
