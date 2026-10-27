/** Filter accountant / money_ledger rows that came from a return refund. */

export type LedgerLikeEntry = {
  id: string;
  kind: string;
  description: string;
  amountMinor: number;
  createdAt: string;
  refId: string | null;
};

/** Accountant ledger describes money_ledger REFUND as "REFUND …". */
export function isRefundLedgerEntry(entry: Pick<LedgerLikeEntry, 'description' | 'kind'>): boolean {
  const d = entry.description.trim().toUpperCase();
  return d.startsWith('REFUND');
}

export function refundLedgerEntries(entries: LedgerLikeEntry[]): LedgerLikeEntry[] {
  return entries.filter(isRefundLedgerEntry);
}
