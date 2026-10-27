import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@worn/db";
import { moneyAccounts, moneyLedger, postLedgerEntry } from "@worn/db";
import type { AnalyticsEventName, AnalyticsProperties } from "@worn/shared";
import type { ParsedPurchase } from "./parsers/types.js";

export type CreditAutofillInput = {
  userId: string;
  purchase: ParsedPurchase;
  /** Prefer merchant+orderRef; fall back to document id for idempotency. */
  documentId?: string;
};

export type CreditAutofillResult = {
  accountId: string;
  deposited: boolean;
  /** True when this call created a new money_accounts row. */
  created: boolean;
  kind: "GIFT_CARD" | "STORE_CREDIT" | "LOYALTY_POINTS";
  balanceMinor: number;
  refId: string;
};

export type CreditAutofillRepos = {
  findDepositByRef(
    userId: string,
    refId: string,
  ): Promise<{ accountId: string } | null>;
  findActiveAccount(
    userId: string,
    merchant: string,
    kind: "GIFT_CARD" | "STORE_CREDIT" | "LOYALTY_POINTS",
  ): Promise<{ id: string } | null>;
  createAccount(input: {
    userId: string;
    kind: "GIFT_CARD" | "STORE_CREDIT" | "LOYALTY_POINTS";
    merchant: string;
    currency: string;
    expiresAt: Date | null;
  }): Promise<{ id: string }>;
  postDeposit(input: {
    accountId: string;
    userId: string;
    delta: number;
    refId: string;
  }): Promise<void>;
  track?(
    name: AnalyticsEventName,
    properties?: AnalyticsProperties,
  ): void;
};

/** Deterministic UUID (v4-shaped) from a stable string key. */
export function stableUuid(key: string): string {
  const h = createHash("sha256").update(key).digest();
  const bytes = Buffer.from(h.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Idempotency key for ingest→credit DEPOSIT: merchant+orderRef, else document id.
 */
export function creditDepositRefId(input: {
  merchant: string;
  orderRef?: string | null;
  documentId?: string | null;
}): string {
  const merchant = input.merchant.trim().toUpperCase();
  if (input.orderRef?.trim()) {
    return stableUuid(`ingest-credit:${merchant}:${input.orderRef.trim()}`);
  }
  if (input.documentId?.trim()) {
    return stableUuid(`ingest-credit:doc:${input.documentId.trim()}`);
  }
  throw new Error("creditDepositRefId requires orderRef or documentId");
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === "23505") return true;
  const msg = (err as Error)?.message ?? "";
  return /duplicate|unique/i.test(msg);
}

/**
 * When a parsed purchase carries a gift-card / store-credit signal, create or
 * update the user's money_accounts row and post an idempotent DEPOSIT.
 */
export async function autofillCreditFromPurchase(
  repos: CreditAutofillRepos,
  input: CreditAutofillInput,
): Promise<CreditAutofillResult | null> {
  const credit = input.purchase.credit;
  if (!credit || credit.balanceMinor <= 0) return null;

  let refId: string;
  try {
    refId = creditDepositRefId({
      merchant: input.purchase.merchant,
      orderRef: input.purchase.orderRef,
      documentId: input.documentId,
    });
  } catch {
    return null;
  }

  const prior = await repos.findDepositByRef(input.userId, refId);
  if (prior) {
    return {
      accountId: prior.accountId,
      deposited: false,
      created: false,
      kind: credit.kind,
      balanceMinor: credit.balanceMinor,
      refId,
    };
  }

  let created = false;
  let account = await repos.findActiveAccount(
    input.userId,
    input.purchase.merchant,
    credit.kind,
  );
  if (!account) {
    account = await repos.createAccount({
      userId: input.userId,
      kind: credit.kind,
      merchant: input.purchase.merchant,
      currency: credit.currency || input.purchase.currency || "INR",
      expiresAt: credit.expiresAt ? new Date(credit.expiresAt) : null,
    });
    created = true;
  }

  try {
    await repos.postDeposit({
      accountId: account.id,
      userId: input.userId,
      delta: credit.balanceMinor,
      refId,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await repos.findDepositByRef(input.userId, refId);
    if (raced) {
      return {
        accountId: raced.accountId,
        deposited: false,
        created: false,
        kind: credit.kind,
        balanceMinor: credit.balanceMinor,
        refId,
      };
    }
    throw err;
  }

  repos.track?.("credit_autofilled", {
    userId: input.userId,
    accountId: account.id,
    kind: credit.kind,
    merchant: input.purchase.merchant,
    balanceMinor: credit.balanceMinor,
    refId,
  });

  return {
    accountId: account.id,
    deposited: true,
    created,
    kind: credit.kind,
    balanceMinor: credit.balanceMinor,
    refId,
  };
}

/** DB-backed {@link CreditAutofillRepos} using `@worn/db` money tables. */
export function createDbCreditAutofillRepos(
  db: Db,
  track?: CreditAutofillRepos["track"],
): CreditAutofillRepos {
  return {
    async findDepositByRef(userId, refId) {
      const rows = await db
        .select({ accountId: moneyLedger.accountId })
        .from(moneyLedger)
        .where(
          and(
            eq(moneyLedger.userId, userId),
            eq(moneyLedger.refId, refId),
            eq(moneyLedger.type, "DEPOSIT"),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async findActiveAccount(userId, merchant, kind) {
      const rows = await db
        .select({ id: moneyAccounts.id })
        .from(moneyAccounts)
        .where(
          and(
            eq(moneyAccounts.userId, userId),
            eq(moneyAccounts.kind, kind),
            eq(moneyAccounts.status, "ACTIVE"),
            sql`lower(${moneyAccounts.merchant}) = lower(${merchant})`,
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async createAccount(input) {
      const id = randomUUID();
      await db.insert(moneyAccounts).values({
        id,
        userId: input.userId,
        kind: input.kind,
        merchant: input.merchant,
        currency: input.currency,
        balanceCacheMinor: 0,
        expiresAt: input.expiresAt,
        status: "ACTIVE",
      });
      return { id };
    },

    async postDeposit(input) {
      await postLedgerEntry(db, {
        accountId: input.accountId,
        userId: input.userId,
        delta: input.delta,
        type: "DEPOSIT",
        refType: "credit.autofill",
        refId: input.refId,
      });
    },

    track,
  };
}
