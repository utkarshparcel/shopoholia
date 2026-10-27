import { DEFAULT_CURRENCY, formatMinor } from "./money.js";

/** Target wears for the “Wear it 3×” challenge. */
export const WEAR_CHALLENGE_TARGET = 3;

export const WASTE_SHARE_WATERMARK = "worn.app";

/** Strip digits / PAN-like runs so share cards never leak card numbers. */
export function redactCardDigits(value: string): string {
  return value.replace(/\d[\d\s-]{3,}\d/g, "••••");
}

/**
 * Blur a merchant/brand label for share cards (keep first + last letter when long enough).
 * Empty / null → generic placeholder. Never returns raw digits.
 */
export function redactBrandLabel(brand: string | null | undefined): string {
  const cleaned = redactCardDigits((brand ?? "").trim());
  if (!cleaned) return "••••";
  if (cleaned.length <= 2) return "••";
  if (cleaned.length <= 4) return `${cleaned[0]}${"•".repeat(cleaned.length - 1)}`;
  return `${cleaned[0]}${"•".repeat(Math.min(cleaned.length - 2, 6))}${cleaned[cleaned.length - 1]}`;
}

export type NeverWornShareInput = {
  neverWornCostMinor: number;
  itemCount: number;
  /** Raw brand strings (will be redacted). */
  brands?: Array<string | null | undefined>;
  currency?: string;
  watermark?: string;
};

export type NeverWornShareCard = {
  neverWornCostMinor: number;
  currency: string;
  itemCount: number;
  amountLabel: string;
  blurredMerchants: string[];
  watermark: string;
  headline: string;
  shareText: string;
};

/** Format never-worn total for share UI (currency-aware). */
export function formatNeverWornAmount(
  neverWornCostMinor: number,
  currency = DEFAULT_CURRENCY,
): string {
  return formatMinor(Math.max(0, neverWornCostMinor), currency);
}

/** Build a shareable “₹/$X never worn” payload (text + redacted merchants + watermark). */
export function buildNeverWornShareCard(input: NeverWornShareInput): NeverWornShareCard {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const watermark = input.watermark ?? WASTE_SHARE_WATERMARK;
  const neverWornCostMinor = Math.max(0, Math.floor(input.neverWornCostMinor));
  const itemCount = Math.max(0, Math.floor(input.itemCount));
  const amountLabel = formatNeverWornAmount(neverWornCostMinor, currency);

  const seen = new Set<string>();
  const blurredMerchants: string[] = [];
  for (const b of input.brands ?? []) {
    if (b == null || !String(b).trim()) continue;
    const label = redactBrandLabel(b);
    if (seen.has(label)) continue;
    seen.add(label);
    blurredMerchants.push(label);
    if (blurredMerchants.length >= 5) break;
  }

  const pieceWord = itemCount === 1 ? "piece" : "pieces";
  const headline =
    neverWornCostMinor > 0
      ? `${amountLabel} never worn`
      : "Closet waste check";

  const merchantLine =
    blurredMerchants.length > 0
      ? `\n${blurredMerchants.join(" · ")}`
      : "";

  const shareText = [
    headline,
    itemCount > 0 ? `${itemCount} ${pieceWord} sitting idle.` : "Tracking clothes I never wear.",
    merchantLine.trim() || null,
    `— ${watermark}`,
  ]
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");

  return {
    neverWornCostMinor,
    currency,
    itemCount,
    amountLabel,
    blurredMerchants,
    watermark,
    headline,
    shareText,
  };
}

export type WearChallengeStatus = {
  eligible: boolean;
  progress: number;
  target: number;
  remaining: number;
  completed: boolean;
  label: string;
};

/**
 * Progress toward the wear-3× challenge.
 * Eligible offer when dead/dormant (or never worn) and not yet completed.
 * Once started client-side, progress still tracks absolute wearCount toward target.
 */
export function wearChallengeProgress(
  wearCount: number,
  status?: string | null,
  opts?: { started?: boolean; target?: number },
): WearChallengeStatus {
  const target = opts?.target ?? WEAR_CHALLENGE_TARGET;
  const count = Math.max(0, Math.floor(wearCount));
  const progress = Math.min(count, target);
  const completed = count >= target;
  const remaining = Math.max(0, target - progress);
  const deadOrDormant = status === "DEAD" || status === "DORMANT";
  const neverWorn = count === 0;
  const inProgress = count > 0 && count < target;
  const eligible =
    !completed &&
    (Boolean(opts?.started) || deadOrDormant || neverWorn || inProgress);

  const label = completed
    ? `Challenge done — worn ${target}×`
    : `${progress}/${target} wears`;

  return {
    eligible,
    progress,
    target,
    remaining,
    completed,
    label,
  };
}

export function wearChallengeCelebrateCopy(
  brandOrCategory: string | null | undefined,
): string {
  const name = (brandOrCategory ?? "").trim() || "that piece";
  return `Nice — you wore ${name} ${WEAR_CHALLENGE_TARGET}×. Habit unlocked.`;
}

export function wearChallengeNudgeCopy(
  progress: WearChallengeStatus,
  brandOrCategory?: string | null,
): string {
  const name = (brandOrCategory ?? "").trim();
  if (progress.completed) {
    return wearChallengeCelebrateCopy(name || null);
  }
  if (progress.progress === 0) {
    return name
      ? `Wear ${name} ${progress.target}× before you dispose of it.`
      : `Wear it ${progress.target}× before you dispose of it.`;
  }
  return `${progress.label} — ${progress.remaining} to go.`;
}
