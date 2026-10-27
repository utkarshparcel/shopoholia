import { describe, expect, it } from "vitest";
import { budgetSoftGate, withBudgetSoftGate } from "./budget-soft-gate.js";

describe("U047 budget-soft-gate", () => {
  it("returns Continue / Cut spend soft gate and never hard-blocks", () => {
    expect(budgetSoftGate({ exceeded: false })).toBeNull();
    const gate = budgetSoftGate({
      exceeded: true,
      category: "APPAREL",
      message: "Heads-up over budget",
    });
    expect(gate?.softBlock).toBe(true);
    expect(gate?.hardBlock).toBe(false);
    expect(gate?.continueLabel).toBe("Continue");
    expect(gate?.cutSpendLabel).toBe("Cut spend");
    expect(gate?.cutSpendHref).toContain("accountant");

    const merged = withBudgetSoftGate({ softBlock: false, score: 1 }, gate);
    expect(merged.softBlock).toBe(true);
    expect(merged.budgetSoftGate?.continueLabel).toBe("Continue");
  });
});
