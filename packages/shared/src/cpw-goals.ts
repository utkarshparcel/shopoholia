import { DEFAULT_CURRENCY, formatMinor } from "./money.js";

/**
 * Cost-per-wear goals (N41-CPW-GOALS).
 * Nudge wears until cost ÷ wears ≤ target CPW.
 */

export type CpwGoalStatus = {
  /** True when a positive target CPW is set. */
  active: boolean;
  targetCpwMinor: number | null;
  currentCpwMinor: number | null;
  costMinor: number;
  wearCount: number;
  /** Ceiling of cost / target — wears required to hit the goal. */
  wearsNeeded: number;
  /** Wears counted toward wearsNeeded (capped). */
  progress: number;
  remaining: number;
  completed: boolean;
  label: string;
};

/** How many wears are required for cost/wears ≤ targetCpwMinor. */
export function wearsNeededForTargetCpw(costMinor: number, targetCpwMinor: number): number {
  const cost = Math.max(0, Math.floor(costMinor));
  const target = Math.max(0, Math.floor(targetCpwMinor));
  if (cost <= 0 || target <= 0) return 0;
  return Math.ceil(cost / target);
}

/**
 * Progress toward a per-item CPW goal.
 * Completed when wearCount ≥ ceil(cost / target) (equivalently current CPW ≤ target).
 */
export function cpwGoalProgress(
  costMinor: number,
  wearCount: number,
  targetCpwMinor: number | null | undefined,
): CpwGoalStatus {
  const cost = Math.max(0, Math.floor(costMinor));
  const count = Math.max(0, Math.floor(wearCount));
  const target =
    targetCpwMinor != null && Number.isFinite(targetCpwMinor) && targetCpwMinor > 0
      ? Math.floor(targetCpwMinor)
      : null;

  const currentCpwMinor =
    cost > 0 ? (count > 0 ? Math.round(cost / count) : cost) : null;

  if (target == null) {
    return {
      active: false,
      targetCpwMinor: null,
      currentCpwMinor,
      costMinor: cost,
      wearCount: count,
      wearsNeeded: 0,
      progress: 0,
      remaining: 0,
      completed: false,
      label: "No CPW goal",
    };
  }

  const wearsNeeded = wearsNeededForTargetCpw(cost, target);
  const completed = wearsNeeded > 0 && count >= wearsNeeded;
  const progress = wearsNeeded > 0 ? Math.min(count, wearsNeeded) : 0;
  const remaining = Math.max(0, wearsNeeded - count);

  const label = completed
    ? `Goal hit — CPW at target`
    : wearsNeeded > 0
      ? `${progress}/${wearsNeeded} wears to target CPW`
      : "CPW goal set";

  return {
    active: true,
    targetCpwMinor: target,
    currentCpwMinor,
    costMinor: cost,
    wearCount: count,
    wearsNeeded,
    progress,
    remaining,
    completed,
    label,
  };
}

export function cpwGoalCelebrateCopy(
  brandOrCategory: string | null | undefined,
  currency = DEFAULT_CURRENCY,
  targetCpwMinor?: number | null,
): string {
  const name = (brandOrCategory ?? "").trim() || "that piece";
  if (targetCpwMinor != null && targetCpwMinor > 0) {
    return `Nice — ${name} hit ${formatMinor(targetCpwMinor, currency)}/wear.`;
  }
  return `Nice — ${name} hit your cost-per-wear goal.`;
}

export function cpwGoalNudgeCopy(
  progress: CpwGoalStatus,
  brandOrCategory?: string | null,
  currency = DEFAULT_CURRENCY,
): string {
  const name = (brandOrCategory ?? "").trim();
  if (!progress.active || progress.targetCpwMinor == null) {
    return name ? `Set a cost-per-wear goal for ${name}.` : "Set a cost-per-wear goal.";
  }
  if (progress.completed) {
    return cpwGoalCelebrateCopy(name || null, currency, progress.targetCpwMinor);
  }
  const targetLabel = formatMinor(progress.targetCpwMinor, currency);
  if (progress.progress === 0) {
    return name
      ? `Wear ${name} ${progress.wearsNeeded}× to hit ${targetLabel}/wear.`
      : `Wear it ${progress.wearsNeeded}× to hit ${targetLabel}/wear.`;
  }
  return `${progress.label} — ${progress.remaining} to go (${targetLabel}/wear).`;
}
