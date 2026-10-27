import { describe, expect, it } from "vitest";
import {
  assertCreditsMergeable,
  creditMergeKey,
  CreditMergeError,
  suggestCreditMerges,
  mergeCreditAccounts,
} from "./credit-merge.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import type { MoneyAccountRecord } from "./repositories/types.js";

const USER = "00000000-0000-4000-8000-0000000000aa";

function account(
  partial: Partial<MoneyAccountRecord> & Pick<MoneyAccountRecord, "id" | "merchant">,
): MoneyAccountRecord {
  return {
    userId: USER,
    kind: "GIFT_CARD",
    currency: "INR",
    balanceCacheMinor: 1000,
    expiresAt: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("creditMergeKey", () => {
  it("normalizes merchant casing/punctuation", () => {
    expect(creditMergeKey(account({ id: "a", merchant: "Myntra" }))).toBe(
      creditMergeKey(account({ id: "b", merchant: "myntra!!" })),
    );
  });
});

describe("assertCreditsMergeable", () => {
  it("rejects currency / closed / self mismatches", () => {
    const a = account({ id: "00000000-0000-4000-8000-000000000001", merchant: "Myntra" });
    const b = account({
      id: "00000000-0000-4000-8000-000000000002",
      merchant: "Myntra",
      currency: "USD",
    });
    expect(() => assertCreditsMergeable(a, b, USER)).toThrow(CreditMergeError);
    expect(() => assertCreditsMergeable(a, a, USER)).toThrow(/itself/);
    expect(() =>
      assertCreditsMergeable(a, { ...a, id: b.id, status: "CLOSED" }, USER),
    ).toThrow(/closed/i);
  });
});

describe("suggestCreditMerges", () => {
  it("suggests when same merchant+currency+kind", () => {
    const a = account({
      id: "00000000-0000-4000-8000-000000000001",
      merchant: "Myntra",
      balanceCacheMinor: 5000,
    });
    const b = account({
      id: "00000000-0000-4000-8000-000000000002",
      merchant: "Myntra",
      balanceCacheMinor: 2000,
    });
    const c = account({
      id: "00000000-0000-4000-8000-000000000003",
      merchant: "Amazon",
      balanceCacheMinor: 1000,
    });
    const suggestions = suggestCreditMerges([a, b, c]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.targetAccountId).toBe(a.id);
    expect(suggestions[0]!.sourceAccountId).toBe(b.id);
  });
});

describe("mergeCreditAccounts", () => {
  it("transfers balance, closes source, keeps soonest expiry, audits via caller", async () => {
    const repos = createMemoryRepositories();
    const soon = new Date(Date.now() + 3 * 86_400_000);
    const later = new Date(Date.now() + 30 * 86_400_000);

    const target = await repos.createMoneyAccount({
      userId: USER,
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: later,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: target.id,
      userId: USER,
      delta: 3000,
      type: "DEPOSIT",
      refType: "test",
      refId: "00000000-0000-4000-8000-000000000011",
    });

    const source = await repos.createMoneyAccount({
      userId: USER,
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: soon,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: source.id,
      userId: USER,
      delta: 1500,
      type: "DEPOSIT",
      refType: "test",
      refId: "00000000-0000-4000-8000-000000000012",
    });

    const result = await mergeCreditAccounts(repos, USER, {
      targetAccountId: target.id,
      sourceAccountId: source.id,
    });

    expect(result.transferredMinor).toBe(1500);
    expect(result.account.balanceCacheMinor).toBe(4500);
    expect(result.account.expiresAt?.getTime()).toBe(soon.getTime());
    expect(result.mergedFromId).toBe(source.id);

    const closed = await repos.findMoneyAccount(source.id, USER);
    expect(closed?.status).toBe("CLOSED");
    expect(closed?.balanceCacheMinor).toBe(0);

    const srcLedger = await repos.listMoneyLedger(source.id, USER);
    expect(srcLedger.some((l) => l.type === "TRANSFER_OUT")).toBe(true);
    const tgtLedger = await repos.listMoneyLedger(target.id, USER);
    expect(tgtLedger.some((l) => l.type === "TRANSFER_IN")).toBe(true);
  });

  async function funded(
    repos: ReturnType<typeof createMemoryRepositories>,
    balance: number,
    ref: string,
  ) {
    const acc = await repos.createMoneyAccount({
      userId: USER,
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    if (balance > 0) {
      await repos.postMoneyLedger({
        accountId: acc.id,
        userId: USER,
        delta: balance,
        type: "DEPOSIT",
        refType: "test",
        refId: ref,
      });
    }
    return acc;
  }

  it("a retried merge returns the first result and moves money once", async () => {
    const repos = createMemoryRepositories();
    const target = await funded(repos, 3000, "00000000-0000-4000-8000-000000000021");
    const source = await funded(repos, 1500, "00000000-0000-4000-8000-000000000022");
    const input = { targetAccountId: target.id, sourceAccountId: source.id };

    const [a, b] = await Promise.all([
      mergeCreditAccounts(repos, USER, input),
      mergeCreditAccounts(repos, USER, input),
    ]);
    const again = await mergeCreditAccounts(repos, USER, input);
    for (const r of [a, b, again]) {
      expect(r.transferredMinor).toBe(1500);
      expect(r.mergedFromId).toBe(source.id);
    }
    expect((await repos.findMoneyAccount(target.id, USER))?.balanceCacheMinor).toBe(4500);
    const srcLedger = await repos.listMoneyLedger(source.id, USER);
    expect(srcLedger.filter((l) => l.type === "TRANSFER_OUT")).toHaveLength(1);
  });

  it("a closed source merged elsewhere, or an empty source, is a conflict", async () => {
    const repos = createMemoryRepositories();
    const target = await funded(repos, 3000, "00000000-0000-4000-8000-000000000031");
    const other = await funded(repos, 100, "00000000-0000-4000-8000-000000000032");
    const source = await funded(repos, 1500, "00000000-0000-4000-8000-000000000033");
    await mergeCreditAccounts(repos, USER, {
      targetAccountId: other.id,
      sourceAccountId: source.id,
    });
    await expect(
      mergeCreditAccounts(repos, USER, {
        targetAccountId: target.id,
        sourceAccountId: source.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: /closed/ });

    const empty = await funded(repos, 0, "unused");
    await expect(
      mergeCreditAccounts(repos, USER, {
        targetAccountId: target.id,
        sourceAccountId: empty.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: /nothing to merge/ });
  });

  it("another user's account is not found", async () => {
    const repos = createMemoryRepositories();
    const target = await funded(repos, 3000, "00000000-0000-4000-8000-000000000041");
    const stranger = await repos.createMoneyAccount({
      userId: "00000000-0000-4000-8000-0000000000bb",
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await expect(
      mergeCreditAccounts(repos, USER, {
        targetAccountId: target.id,
        sourceAccountId: stranger.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
