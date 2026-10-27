/**
 * U035 — sell / donate / barter / keep decision tree → next action.
 */

export type DisposeTreeMode = "SELL" | "DONATE" | "BARTER" | "KEEP";

export type DisposeTreeStep =
  | "start"
  | "value"
  | "effort"
  | "mode"
  | "done";

export type DisposeTreeAnswers = {
  /** Still wears / wants to keep? */
  stillWear?: boolean;
  /** Item has resale value? */
  hasValue?: boolean;
  /** Willing to list / ship? */
  willingEffort?: boolean;
  /** Prefer gift/barter over cash? */
  preferBarter?: boolean;
};

export type DisposeTreeResult = {
  mode: DisposeTreeMode;
  nextAction: "create_disposition" | "keep_snooze";
  reason: string;
  /** Closet-only — never Play blend. */
  surface: "closet";
};

export const KEEP_SNOOZE_DAYS = 30;

export function resolveDisposeTree(answers: DisposeTreeAnswers): DisposeTreeResult {
  if (answers.stillWear === true) {
    return {
      mode: "KEEP",
      nextAction: "keep_snooze",
      reason: "Still in rotation — snooze dispose reminder.",
      surface: "closet",
    };
  }
  if (answers.hasValue === false) {
    return {
      mode: "DONATE",
      nextAction: "create_disposition",
      reason: "Low resale value — donate clears closet space.",
      surface: "closet",
    };
  }
  if (answers.preferBarter === true) {
    return {
      mode: "BARTER",
      nextAction: "create_disposition",
      reason: "Trade instead of cash — start barter listing.",
      surface: "closet",
    };
  }
  if (answers.willingEffort === false) {
    return {
      mode: "DONATE",
      nextAction: "create_disposition",
      reason: "Skip listing work — donate path is faster.",
      surface: "closet",
    };
  }
  return {
    mode: "SELL",
    nextAction: "create_disposition",
    reason: "Has value and effort OK — list to sell.",
    surface: "closet",
  };
}

export function disposeTreeSteps(): Array<{
  id: keyof DisposeTreeAnswers;
  prompt: string;
  yesLabel: string;
  noLabel: string;
}> {
  return [
    {
      id: "stillWear",
      prompt: "Do you still wear this?",
      yesLabel: "Yes — keep",
      noLabel: "No — let go",
    },
    {
      id: "hasValue",
      prompt: "Could someone pay for it?",
      yesLabel: "Yes — has value",
      noLabel: "No — donate",
    },
    {
      id: "willingEffort",
      prompt: "OK listing / shipping?",
      yesLabel: "Yes — sell",
      noLabel: "No — donate",
    },
    {
      id: "preferBarter",
      prompt: "Prefer trade over cash?",
      yesLabel: "Barter",
      noLabel: "Sell for cash",
    },
  ];
}

export function keepSnoozeUntil(
  from: Date = new Date(),
  days: number = KEEP_SNOOZE_DAYS,
): string {
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString();
}
