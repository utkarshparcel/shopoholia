/**
 * U047 — Soft budget gate on Closet→Play bridge CTAs.
 * Never hard-blocks pay inside Closet; Continue / Cut spend chore only.
 */

export type BudgetSoftGate = {
  softBlock: boolean;
  title: string;
  body: string;
  continueLabel: string;
  cutSpendLabel: string;
  /** Closet accountant deep link for cut-spend. */
  cutSpendHref: string;
  /** Never true — documents that Closet must not hard-block. */
  hardBlock: false;
};

export function budgetSoftGate(input: {
  exceeded: boolean;
  category?: string | null;
  message?: string | null;
}): BudgetSoftGate | null {
  if (!input.exceeded) return null;
  const category = input.category?.trim() || "this";
  return {
    softBlock: true,
    title: "Over budget this period",
    body:
      input.message?.trim() ||
      `This Play haul would push your ${category} budget over the limit. Continue anyway, or cut spend in Closet.`,
    continueLabel: "Continue",
    cutSpendLabel: "Cut spend",
    cutSpendHref: "/(closet)/accountant",
    hardBlock: false,
  };
}

/** Merge soft gate onto prebuy-style response without blocking pay. */
export function withBudgetSoftGate<T extends { softBlock?: boolean }>(
  result: T,
  gate: BudgetSoftGate | null,
): T & { budgetSoftGate: BudgetSoftGate | null } {
  return {
    ...result,
    softBlock: Boolean(gate?.softBlock || result.softBlock),
    budgetSoftGate: gate,
  };
}
