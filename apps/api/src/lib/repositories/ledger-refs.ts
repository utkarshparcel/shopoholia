import { ledgerRefId } from "@worn/db";

/*
 * `coin_ledger.ref_id` is a uuid column, so refs built from text (a local day, a click id, an
 * idempotency key scoped to an order) go through `ledgerRefId`, which is deterministic: the same
 * parts always give the same uuid.
 */

/** The ref for one user's streak claim on one local day. */
export function streakLedgerRef(userId: string, dateKey: string): string {
  return ledgerRefId("streak", userId, dateKey);
}

/** The ref for the coins paid on one confirmed affiliate click. */
export function cashbackLedgerRef(clickId: string): string {
  return ledgerRefId("cashback", clickId);
}

/** The ref for a keyed reveal unlock, scoped to its order so a key can't replay on another order. */
export function revealUnlockLedgerRef(orderId: string, idempotencyKey: string): string {
  return ledgerRefId("reveal_unlock", orderId, idempotencyKey);
}
