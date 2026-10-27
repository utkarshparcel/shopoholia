import { beforeEach, describe, expect, it } from "vitest";
import {
  annotateUserMismatches,
  clearReconcileInvestigated,
  markReconcileInvestigated,
  reconcileMismatchActions,
} from "./user-reconcile.js";

describe("U046 user-reconcile", () => {
  beforeEach(() => clearReconcileInvestigated());

  it("lists mismatches with fix actions and mark investigated", () => {
    const mismatches = [
      {
        accountId: "a1",
        userId: "u1",
        merchant: "Myntra",
        cachedMinor: 100,
        ledgerSumMinor: 80,
        lastBalanceAfter: 80,
        driftMinor: 20,
        fixed: false,
      },
      {
        accountId: "a2",
        userId: "u2",
        merchant: "Other",
        cachedMinor: 1,
        ledgerSumMinor: 1,
        lastBalanceAfter: 1,
        driftMinor: 0,
        fixed: true,
      },
    ];
    const rows = annotateUserMismatches("u1", mismatches);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.investigated).toBe(false);
    const actions = reconcileMismatchActions(rows[0]!);
    expect(actions.map((a) => a.action)).toEqual([
      "recalc",
      "open_account",
      "investigate",
    ]);
    markReconcileInvestigated("u1", "a1");
    expect(annotateUserMismatches("u1", mismatches)[0]?.investigated).toBe(true);
  });
});
