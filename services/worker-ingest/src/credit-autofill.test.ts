import { describe, expect, it, vi } from "vitest";
import { detectCreditSignal } from "./parsers/credit-detect.js";
import {
  autofillCreditFromPurchase,
  createDbCreditAutofillRepos,
  creditDepositRefId,
  stableUuid,
  type CreditAutofillRepos,
} from "./credit-autofill.js";
import { processIngestJob, type IngestPersister } from "./index.js";
import type { ParsedPurchase, RawEmailMessage } from "./parsers/types.js";
import type { Db } from "@worn/db";

describe("detectCreditSignal", () => {
  it("detects Amazon gift cards", () => {
    const signal = detectCreditSignal(
      "Your Amazon.in Gift Card",
      "You received a gift card value of ₹500.00. Order ID: 123-4567890-1234567",
    );
    expect(signal).toEqual(
      expect.objectContaining({
        kind: "GIFT_CARD",
        balanceMinor: 50000,
        currency: "INR",
      }),
    );
  });

  it("detects store credit / refund-to-credit", () => {
    const signal = detectCreditSignal(
      "Refund issued as store credit",
      "₹1,250.00 has been issued as store credit for order #FK-99881. Expires: 2027-01-15",
    );
    expect(signal?.kind).toBe("STORE_CREDIT");
    expect(signal?.balanceMinor).toBe(125000);
    expect(signal?.expiresAt).toBe("2027-01-15T00:00:00.000Z");
  });

  it("detects loyalty points (U009)", () => {
    const signal = detectCreditSignal(
      "Myntra Insider",
      "You have 2,500 SuperCoins. Points balance expires 2026-12-31.",
    );
    expect(signal?.kind).toBe("LOYALTY_POINTS");
    expect(signal?.balanceMinor).toBe(250_000);
  });

  it("returns null for ordinary purchase emails", () => {
    expect(
      detectCreditSignal("Your order shipped", "Grand Total: ₹999.00"),
    ).toBeNull();
  });

  it("uses fallback total and DD/MM expiry when amount omitted", () => {
    const signal = detectCreditSignal(
      "Gift voucher received",
      "A digital gift was added to your wallet. Valid until 15/03/2027",
      25000,
      "INR",
    );
    expect(signal).toMatchObject({
      kind: "GIFT_CARD",
      balanceMinor: 25000,
      currency: "INR",
    });
    expect(signal?.expiresAt).toMatch(/^2027-03-15/);
  });

  it("parses USD gift card with reverse amount phrasing", () => {
    const signal = detectCreditSignal(
      "e-Gift received",
      "$25.00 gift card balance. Expires 2028-12-01",
    );
    expect(signal?.kind).toBe("GIFT_CARD");
    expect(signal?.balanceMinor).toBe(2500);
    expect(signal?.currency).toBe("USD");
    expect(signal?.expiresAt).toBe("2028-12-01T00:00:00.000Z");
  });

  it("prefers STORE_CREDIT when refund-to-credit phrasing is present", () => {
    const signal = detectCreditSignal(
      "Gift card note",
      "gift card credited to your account $10.00",
    );
    expect(signal?.kind).toBe("STORE_CREDIT");
    expect(signal?.balanceMinor).toBe(1000);
  });

  it("returns null when gift signal has no usable amount", () => {
    expect(detectCreditSignal("Gift card", "You received a gift card", 0)).toBeNull();
  });
});

describe("creditDepositRefId", () => {
  it("is stable for the same merchant+orderRef", () => {
    const a = creditDepositRefId({ merchant: "Amazon", orderRef: "GC-1" });
    const b = creditDepositRefId({ merchant: "amazon", orderRef: "GC-1" });
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("falls back to document id", () => {
    const id = creditDepositRefId({
      merchant: "Myntra",
      documentId: "doc-abc",
    });
    expect(id).toBe(stableUuid("ingest-credit:doc:doc-abc"));
  });
});

function memoryCreditRepos(): CreditAutofillRepos & {
  deposits: Array<{ accountId: string; refId: string; delta: number }>;
  accounts: Map<string, { id: string; merchant: string; kind: string; balance: number }>;
} {
  const accounts = new Map<
    string,
    { id: string; merchant: string; kind: string; balance: number }
  >();
  const deposits: Array<{ accountId: string; refId: string; delta: number }> = [];
  const byRef = new Map<string, string>();

  return {
    accounts,
    deposits,
    async findDepositByRef(userId, refId) {
      void userId;
      const accountId = byRef.get(refId);
      return accountId ? { accountId } : null;
    },
    async findActiveAccount(userId, merchant, kind) {
      void userId;
      for (const a of accounts.values()) {
        if (
          a.merchant.toLowerCase() === merchant.toLowerCase() &&
          a.kind === kind
        ) {
          return { id: a.id };
        }
      }
      return null;
    },
    async createAccount(input) {
      const id = `acc-${accounts.size + 1}`;
      accounts.set(id, {
        id,
        merchant: input.merchant,
        kind: input.kind,
        balance: 0,
      });
      return { id };
    },
    async postDeposit(input) {
      if (byRef.has(input.refId)) {
        const err = new Error("duplicate");
        (err as { code?: string }).code = "23505";
        throw err;
      }
      byRef.set(input.refId, input.accountId);
      deposits.push({
        accountId: input.accountId,
        refId: input.refId,
        delta: input.delta,
      });
      const a = accounts.get(input.accountId);
      if (a) a.balance += input.delta;
    },
    track: vi.fn(),
  };
}

describe("autofillCreditFromPurchase (idempotent)", () => {
  const purchase: ParsedPurchase = {
    merchant: "AMAZON",
    orderRef: "GC-ORDER-9",
    purchasedAt: "2026-01-01T00:00:00.000Z",
    currency: "INR",
    totalMinor: 50000,
    items: [{ title: "Amazon Gift Card", priceMinor: 50000, qty: 1 }],
    confidence: 0.9,
    parserId: "amazon",
    credit: {
      kind: "GIFT_CARD",
      balanceMinor: 50000,
      currency: "INR",
      expiresAt: null,
    },
  };

  it("creates account + DEPOSIT once, then no-ops on retry", async () => {
    const repos = memoryCreditRepos();
    const first = await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-1",
    });
    expect(first?.deposited).toBe(true);
    expect(first?.created).toBe(true);
    expect(repos.deposits).toHaveLength(1);
    expect(repos.track).toHaveBeenCalledWith(
      "credit_autofilled",
      expect.objectContaining({
        kind: "GIFT_CARD",
        balanceMinor: 50000,
        merchant: "AMAZON",
      }),
    );

    const second = await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-1",
    });
    expect(second?.deposited).toBe(false);
    expect(second?.accountId).toBe(first!.accountId);
    expect(repos.deposits).toHaveLength(1);
    expect(repos.accounts.size).toBe(1);
  });

  it("idempotency key prefers merchant+orderRef over document id", async () => {
    const repos = memoryCreditRepos();
    await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-A",
    });
    await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-B",
    });
    expect(repos.deposits).toHaveLength(1);
  });

  it("returns null when credit missing or non-positive", async () => {
    const repos = memoryCreditRepos();
    expect(
      await autofillCreditFromPurchase(repos, {
        userId: "user-1",
        purchase: { ...purchase, credit: undefined },
      }),
    ).toBeNull();
    expect(
      await autofillCreditFromPurchase(repos, {
        userId: "user-1",
        purchase: {
          ...purchase,
          credit: { ...purchase.credit!, balanceMinor: 0 },
        },
      }),
    ).toBeNull();
  });

  it("returns null when neither orderRef nor documentId is available", async () => {
    const repos = memoryCreditRepos();
    expect(
      await autofillCreditFromPurchase(repos, {
        userId: "user-1",
        purchase: { ...purchase, orderRef: null },
      }),
    ).toBeNull();
  });

  it("reuses an existing ACTIVE account without creating", async () => {
    const repos = memoryCreditRepos();
    await repos.createAccount({
      userId: "user-1",
      kind: "GIFT_CARD",
      merchant: "AMAZON",
      currency: "INR",
      expiresAt: null,
    });
    const result = await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase: {
        ...purchase,
        credit: {
          kind: "GIFT_CARD",
          balanceMinor: 10000,
          currency: "INR",
          expiresAt: "2027-06-01T00:00:00.000Z",
        },
      },
      documentId: "doc-reuse",
    });
    expect(result?.created).toBe(false);
    expect(result?.deposited).toBe(true);
    expect(repos.accounts.size).toBe(1);
  });

  it("recovers when postDeposit hits unique race and deposit is found", async () => {
    const repos = memoryCreditRepos();
    const winnerAccountId = "acc-winner";
    repos.postDeposit = async (input) => {
      const err = new Error("duplicate key value violates unique constraint");
      (err as { code?: string }).code = "23505";
      repos.findDepositByRef = async () => ({ accountId: winnerAccountId });
      void input;
      throw err;
    };

    const result = await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-race",
    });
    expect(result).toEqual(
      expect.objectContaining({
        accountId: winnerAccountId,
        deposited: false,
        created: false,
        kind: "GIFT_CARD",
        balanceMinor: 50000,
      }),
    );
  });

  it("also treats message-based unique errors as races", async () => {
    const repos = memoryCreditRepos();
    repos.postDeposit = async () => {
      throw new Error("UNIQUE constraint failed");
    };
    repos.findDepositByRef = async () => ({ accountId: "acc-msg" });
    const result = await autofillCreditFromPurchase(repos, {
      userId: "user-1",
      purchase,
      documentId: "doc-msg-race",
    });
    expect(result?.accountId).toBe("acc-msg");
    expect(result?.deposited).toBe(false);
  });

  it("rethrows unique violation when deposit still missing after race", async () => {
    const repos = memoryCreditRepos();
    repos.postDeposit = async () => {
      const err = new Error("duplicate");
      (err as { code?: string }).code = "23505";
      throw err;
    };
    await expect(
      autofillCreditFromPurchase(repos, {
        userId: "user-1",
        purchase,
        documentId: "doc-orphan-race",
      }),
    ).rejects.toThrow(/duplicate/);
  });

  it("rethrows non-unique postDeposit errors", async () => {
    const repos = memoryCreditRepos();
    repos.postDeposit = async () => {
      throw new Error("connection reset");
    };
    await expect(
      autofillCreditFromPurchase(repos, {
        userId: "user-1",
        purchase,
        documentId: "doc-fail",
      }),
    ).rejects.toThrow(/connection reset/);
  });
});

describe("createDbCreditAutofillRepos", () => {
  it("findDepositByRef / findActiveAccount / createAccount hit Db", async () => {
    const selects: unknown[][] = [
      [{ accountId: "acc-from-ledger" }],
      [],
      [{ id: "acc-active" }],
    ];
    let selectIdx = 0;
    const inserts: unknown[] = [];

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selects[selectIdx++] ?? [],
          }),
        }),
      }),
      insert: () => ({
        values: async (v: unknown) => {
          inserts.push(v);
        },
      }),
      // postLedgerEntry may touch transaction helpers — not invoked in this test
    } as unknown as Db;

    const track = vi.fn();
    const repos = createDbCreditAutofillRepos(db, track);

    expect(await repos.findDepositByRef("u1", "ref-1")).toEqual({
      accountId: "acc-from-ledger",
    });
    expect(await repos.findDepositByRef("u1", "ref-miss")).toBeNull();
    expect(await repos.findActiveAccount("u1", "Amazon", "GIFT_CARD")).toEqual({
      id: "acc-active",
    });

    const created = await repos.createAccount({
      userId: "u1",
      kind: "STORE_CREDIT",
      merchant: "Myntra",
      currency: "INR",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(inserts[0]).toMatchObject({
      id: created.id,
      userId: "u1",
      kind: "STORE_CREDIT",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      status: "ACTIVE",
    });
    expect(repos.track).toBe(track);
  });

  it("postDeposit delegates to postLedgerEntry", async () => {
    const ledgerCalls: unknown[] = [];
    const db = {
      // Minimal surface — postLedgerEntry is mocked below via spy on module
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
      execute: async () => undefined,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            for: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      insert: () => ({
        values: async () => undefined,
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    } as unknown as Db;

    const dbMod = await import("@worn/db");
    const spy = vi
      .spyOn(dbMod, "postLedgerEntry")
      .mockImplementation(async (_db, input) => {
        ledgerCalls.push(input);
        return {
          id: "led-1",
          accountId: input.accountId,
          userId: input.userId,
          delta: input.delta,
          balanceAfter: input.delta,
          type: input.type,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          createdAt: new Date(),
        } as never;
      });

    try {
      const repos = createDbCreditAutofillRepos(db);
      await repos.postDeposit({
        accountId: "acc-1",
        userId: "u1",
        delta: 2500,
        refId: "ref-deposit",
      });
      expect(ledgerCalls).toEqual([
        expect.objectContaining({
          accountId: "acc-1",
          userId: "u1",
          delta: 2500,
          type: "DEPOSIT",
          refType: "credit.autofill",
          refId: "ref-deposit",
        }),
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("processIngestJob → credit autofill", () => {
  it("wires creditRepos after a gift-card parse", async () => {
    const repos = memoryCreditRepos();
    const persister: IngestPersister = {
      insertPurchase: vi.fn(async () => "pid-gc"),
      markDocument: vi.fn(async () => undefined),
      updateSourceCursor: vi.fn(async () => undefined),
    };

    const msg: RawEmailMessage = {
      messageId: "m1",
      from: "auto-confirm@amazon.in",
      to: "u@example.com",
      subject: "Amazon Gift Card",
      text: "Gift card value ₹750.00. Order ID: 111-2222333-4444555",
      receivedAt: "2026-02-01T00:00:00.000Z",
    };

    const result = await processIngestJob(msg, {
      persister,
      sourceKind: "EMAIL",
      documentId: "doc-gc",
      userId: "user-99",
      creditRepos: repos,
    });

    expect(result.matched).toBe(true);
    expect(result.purchase?.credit?.kind).toBe("GIFT_CARD");
    expect(result.creditAutofill?.deposited).toBe(true);
    expect(repos.deposits).toHaveLength(1);
    expect(repos.deposits[0]!.delta).toBe(75000);
  });
});
