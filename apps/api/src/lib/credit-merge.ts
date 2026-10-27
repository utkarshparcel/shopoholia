import { normalizeMerchantKey } from "@worn/shared";
import { randomUUID } from "node:crypto";
import type { MoneyAccountRecord, Repositories } from "./repositories/types.js";

export class CreditMergeError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "CreditMergeError";
  }
}

/** Merge key: normalized merchant + currency + kind (gift/store twins only). */
export function creditMergeKey(account: {
  merchant: string;
  currency: string;
  kind: MoneyAccountRecord["kind"];
}): string {
  return `${normalizeMerchantKey(account.merchant)}|${account.currency}|${account.kind}`;
}

export function assertCreditsMergeable(
  target: MoneyAccountRecord,
  source: MoneyAccountRecord,
  userId: string,
): void {
  if (target.userId !== userId || source.userId !== userId) {
    throw new CreditMergeError("NOT_FOUND", "Credit account not found");
  }
  if (target.id === source.id) {
    throw new CreditMergeError(
      "BAD_REQUEST",
      "Cannot merge a credit account into itself",
    );
  }
  if (target.status === "CLOSED" || source.status === "CLOSED") {
    throw new CreditMergeError(
      "CONFLICT",
      "Cannot merge a closed credit account",
    );
  }
  if (target.kind !== source.kind) {
    throw new CreditMergeError(
      "CONFLICT",
      "Credits must share the same kind to merge",
    );
  }
  if (target.currency !== source.currency) {
    throw new CreditMergeError(
      "CONFLICT",
      "Credits must share the same currency to merge",
    );
  }
  if (creditMergeKey(target) !== creditMergeKey(source)) {
    throw new CreditMergeError(
      "CONFLICT",
      "Credits must share the same merchant to merge",
    );
  }
}

/**
 * Suggest merge pairs: same merchant+currency+kind, both ACTIVE/FROZEN with
 * balance > 0. Prefer keeping the larger balance (or sooner expiry) as target.
 */
export function suggestCreditMerges(
  accounts: MoneyAccountRecord[],
): Array<{ targetAccountId: string; sourceAccountId: string; merchant: string; currency: string }> {
  const byKey = new Map<string, MoneyAccountRecord[]>();
  for (const a of accounts) {
    if (a.status === "CLOSED") continue;
    if (a.kind !== "GIFT_CARD" && a.kind !== "STORE_CREDIT") continue;
    if (a.balanceCacheMinor <= 0) continue;
    const key = creditMergeKey(a);
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }

  const suggestions: Array<{
    targetAccountId: string;
    sourceAccountId: string;
    merchant: string;
    currency: string;
  }> = [];

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      if (b.balanceCacheMinor !== a.balanceCacheMinor) {
        return b.balanceCacheMinor - a.balanceCacheMinor;
      }
      const ae = a.expiresAt?.getTime() ?? Infinity;
      const be = b.expiresAt?.getTime() ?? Infinity;
      return ae - be;
    });
    const target = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      const source = sorted[i]!;
      suggestions.push({
        targetAccountId: target.id,
        sourceAccountId: source.id,
        merchant: target.merchant,
        currency: target.currency,
      });
    }
  }
  return suggestions;
}

function soonerExpiresAt(
  a: Date | null,
  b: Date | null,
): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * Merge `source` into `target`: transfer full balance, keep soonest expiry,
 * close source. Ledger: TRANSFER_OUT + TRANSFER_IN with shared merge ref.
 */
export async function mergeCreditAccounts(
  repos: Repositories,
  userId: string,
  input: { targetAccountId: string; sourceAccountId: string },
): Promise<{
  account: MoneyAccountRecord;
  mergedFromId: string;
  transferredMinor: number;
}> {
  const target = await repos.findMoneyAccount(input.targetAccountId, userId);
  const source = await repos.findMoneyAccount(input.sourceAccountId, userId);
  if (!target || !source) {
    throw new CreditMergeError("NOT_FOUND", "Credit account not found");
  }
  assertCreditsMergeable(target, source, userId);

  const transferredMinor = source.balanceCacheMinor;
  if (transferredMinor <= 0) {
    throw new CreditMergeError(
      "CONFLICT",
      "Source credit has nothing to merge",
    );
  }

  const mergeRef = randomUUID();

  await repos.postMoneyLedger({
    accountId: source.id,
    userId,
    delta: -transferredMinor,
    type: "TRANSFER_OUT",
    refType: "credit.merge",
    refId: mergeRef,
  });

  await repos.postMoneyLedger({
    accountId: target.id,
    userId,
    delta: transferredMinor,
    type: "TRANSFER_IN",
    refType: "credit.merge",
    refId: mergeRef,
  });

  const nextExpires = soonerExpiresAt(target.expiresAt, source.expiresAt);
  await repos.updateMoneyAccount(source.id, userId, { status: "CLOSED" });
  const patched =
    (await repos.updateMoneyAccount(target.id, userId, {
      expiresAt: nextExpires,
    })) ?? (await repos.findMoneyAccount(target.id, userId));

  if (!patched) {
    throw new CreditMergeError("NOT_FOUND", "Credit account not found");
  }

  // Re-read for accurate balance cache after transfers.
  const fresh = await repos.findMoneyAccount(target.id, userId);
  if (!fresh) {
    throw new CreditMergeError("NOT_FOUND", "Credit account not found");
  }

  return {
    account: fresh,
    mergedFromId: source.id,
    transferredMinor,
  };
}
