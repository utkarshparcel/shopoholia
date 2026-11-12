import { describe, expect, it } from "vitest";
import {
  annotateUserMismatches,
  markReconcileInvestigated,
  reconcileMismatchActions,
} from "./user-reconcile.js";
import { createMemoryRepositories } from "./repositories/memory.js";

describe("U046 user-reconcile", () => {
  it("lists mismatches with fix actions and mark investigated", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000321");
    const { user: other } = await repos.createUser("+919800000322");
    const account = await repos.createMoneyAccount({ userId: user.id, kind: "GIFT_CARD", merchant: "Myntra", currency: "INR", balanceCacheMinor: 100, expiresAt: null, status: "ACTIVE" });
    const mismatches = [
      {
        accountId: account.id,
        userId: user.id,
        merchant: "Myntra",
        cachedMinor: 100,
        ledgerSumMinor: 80,
        lastBalanceAfter: 80,
        driftMinor: 20,
        fixed: false,
      },
      {
        accountId: "a2",
        userId: other.id,
        merchant: "Other",
        cachedMinor: 1,
        ledgerSumMinor: 1,
        lastBalanceAfter: 1,
        driftMinor: 0,
        fixed: true,
      },
    ];
    const rows = await annotateUserMismatches(repos, user.id, mismatches);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.investigated).toBe(false);
    const actions = reconcileMismatchActions(rows[0]!);
    expect(actions.map((a) => a.action)).toEqual([
      "recalc",
      "open_account",
      "investigate",
    ]);
    const at = new Date("2026-11-10T08:00:00.000Z");
    expect(await markReconcileInvestigated(repos, user.id, account.id, at)).toEqual({
      accountId: account.id,
      investigatedAt: at.toISOString(),
    });
    const after = await annotateUserMismatches(repos, user.id, mismatches);
    expect(after[0]).toMatchObject({ investigated: true, investigatedAt: at.toISOString() });
    expect(await repos.listReconcileInvestigatedAccounts(user.id)).toEqual([{ accountId: account.id, investigatedAt: at }]);
  });

  it("refuses another user's account", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000323");
    const { user: other } = await repos.createUser("+919800000324");
    const theirs = await repos.createMoneyAccount({ userId: other.id, kind: "GIFT_CARD", merchant: "Ajio", currency: "INR", balanceCacheMinor: 0, expiresAt: null, status: "ACTIVE" });
    expect(await markReconcileInvestigated(repos, user.id, theirs.id)).toBeNull();
    expect(await repos.listReconcileInvestigatedAccounts(other.id)).toEqual([]);
  });
});
