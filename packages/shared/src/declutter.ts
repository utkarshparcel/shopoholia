import { WASTE_SHARE_WATERMARK } from "./waste.js";

/** Default goal: sell/donate/barter this many unique wardrobe items. */
export const DECLUTTER_CHALLENGE_TARGET = 5;

export const DECLUTTER_SHARE_WATERMARK = WASTE_SHARE_WATERMARK;

/** Listing statuses that still count toward declutter progress. */
const COUNTED_STATUSES = new Set(["ACTIVE", "SOLD", "DONATED", "BARTERED"]);

export type DeclutterListingLike = {
  wardrobeItemId: string;
  mode?: string | null;
  status?: string | null;
};

/**
 * Count unique wardrobe items the user has listed to sell / donate / barter.
 * CANCELLED listings do not count; duplicates of the same item count once.
 */
export function countDisposedItems(listings: DeclutterListingLike[]): number {
  const seen = new Set<string>();
  for (const l of listings) {
    const status = (l.status ?? "ACTIVE").toUpperCase();
    if (!COUNTED_STATUSES.has(status)) continue;
    const id = String(l.wardrobeItemId ?? "").trim();
    if (!id) continue;
    seen.add(id);
  }
  return seen.size;
}

export type DeclutterChallengeStatus = {
  eligible: boolean;
  started: boolean;
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  label: string;
};

/**
 * Progress toward the declutter challenge (dispose N items via disposition).
 * Eligible when not completed; once started, stays visible until done.
 */
export function declutterChallengeProgress(
  disposedCount: number,
  opts?: { started?: boolean; target?: number },
): DeclutterChallengeStatus {
  const target = opts?.target ?? DECLUTTER_CHALLENGE_TARGET;
  const started = Boolean(opts?.started);
  const count = Math.max(0, Math.floor(disposedCount));
  const progress = Math.min(count, target);
  const completed = count >= target;
  const remaining = Math.max(0, target - progress);
  /** Offer / continue until the goal is met; completed challenges are no longer eligible. */
  const eligible = !completed;

  const label = completed
    ? `Challenge done — cleared ${target}`
    : `${progress}/${target} cleared`;

  return {
    eligible,
    started,
    progress,
    target,
    remaining,
    completed,
    label,
  };
}

export function declutterChallengeCelebrateCopy(target = DECLUTTER_CHALLENGE_TARGET): string {
  return `Nice — you cleared ${target} pieces. Closet lighter.`;
}

export function declutterChallengeNudgeCopy(
  progress: DeclutterChallengeStatus,
): string {
  if (progress.completed) {
    return declutterChallengeCelebrateCopy(progress.target);
  }
  if (!progress.started && progress.progress === 0) {
    return `Clear ${progress.target} pieces — sell or donate from dead inventory.`;
  }
  if (progress.progress === 0) {
    return `Challenge on: sell or donate ${progress.target} pieces.`;
  }
  return `${progress.label} — ${progress.remaining} to go.`;
}

export type DeclutterShareInput = {
  progress: number;
  target?: number;
  /** Modes used so far (SELL / DONATE / BARTER) — shown as counts, not brands. */
  modes?: Array<string | null | undefined>;
  watermark?: string;
};

export type DeclutterShareCard = {
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  watermark: string;
  headline: string;
  modeLine: string | null;
  shareText: string;
};

/** Build a shareable declutter progress card (no merchants / card digits). */
export function buildDeclutterShareCard(input: DeclutterShareInput): DeclutterShareCard {
  const target = input.target ?? DECLUTTER_CHALLENGE_TARGET;
  const watermark = input.watermark ?? DECLUTTER_SHARE_WATERMARK;
  const progress = Math.min(Math.max(0, Math.floor(input.progress)), target);
  const remaining = Math.max(0, target - progress);
  const completed = progress >= target;

  const modeCounts = new Map<string, number>();
  for (const m of input.modes ?? []) {
    const key = String(m ?? "").trim().toUpperCase();
    if (!key || key === "CANCELLED") continue;
    if (key !== "SELL" && key !== "DONATE" && key !== "BARTER") continue;
    modeCounts.set(key, (modeCounts.get(key) ?? 0) + 1);
  }
  const modeParts: string[] = [];
  for (const key of ["SELL", "DONATE", "BARTER"] as const) {
    const n = modeCounts.get(key);
    if (n) modeParts.push(`${n} ${key.toLowerCase()}`);
  }
  const modeLine = modeParts.length > 0 ? modeParts.join(" · ") : null;

  const headline = completed
    ? `I cleared ${target} pieces from my closet`
    : progress > 0
      ? `Declutter challenge: ${progress}/${target} cleared`
      : `Starting a ${target}-piece declutter`;

  const shareText = [
    headline,
    modeLine,
    completed ? "Less dead inventory. More wears that matter." : null,
    `— ${watermark}`,
  ]
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");

  return {
    progress,
    target,
    remaining,
    completed,
    watermark,
    headline,
    modeLine,
    shareText,
  };
}
