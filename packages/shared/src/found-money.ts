import { DEFAULT_CURRENCY, formatMinor } from "./money.js";
import { redactBrandLabel, WASTE_SHARE_WATERMARK } from "./waste.js";

/** Watermark for found-money share cards (same as waste: worn.app). */
export const FOUND_MONEY_SHARE_WATERMARK = WASTE_SHARE_WATERMARK;

export type FoundMoneyShareAccount = {
  merchant?: string | null;
  expiresAt?: string | null;
};

/** Share blur intensity — `reels` is Reels/TikTok-safe (extra merchant + digit blur). */
export type FoundMoneyBlurPreset = "standard" | "reels";

export type FoundMoneyShareInput = {
  totalMinor: number;
  accountCount: number;
  /** Raw merchant strings (will be redacted). */
  merchants?: Array<string | null | undefined>;
  /** Optional accounts — merchants + soonest expiry used for deadline line. */
  accounts?: FoundMoneyShareAccount[];
  currency?: string;
  watermark?: string;
  now?: Date;
  /** W089 — default `standard`; `reels` hides first/last letters + digit-blurs the total. */
  blurPreset?: FoundMoneyBlurPreset;
};

export type FoundMoneyShareCard = {
  totalMinor: number;
  currency: string;
  accountCount: number;
  amountLabel: string;
  /** Digit-blurred amount for Reels / Status (always set; equals amountLabel when standard). */
  displayAmountLabel: string;
  blurredMerchants: string[];
  watermark: string;
  headline: string;
  deadlineLine: string | null;
  daysToNearestExpiry: number | null;
  shareText: string;
  blurPreset: FoundMoneyBlurPreset;
  /** Reels-safe vertical frame hint (W089). */
  aspectRatio: "9:16" | "1:1";
};

function daysUntil(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ms = t - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

function nearestExpiryDays(
  accounts: FoundMoneyShareAccount[] | undefined,
  now: Date,
): number | null {
  if (!accounts?.length) return null;
  let best: number | null = null;
  for (const a of accounts) {
    if (!a.expiresAt) continue;
    const d = daysUntil(a.expiresAt, now);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

function collectMerchants(input: FoundMoneyShareInput): Array<string | null | undefined> {
  if (input.merchants?.length) return input.merchants;
  return (input.accounts ?? []).map((a) => a.merchant);
}

/** Format found-money total for share UI (currency-aware). */
export function formatFoundMoneyAmount(
  totalMinor: number,
  currency = DEFAULT_CURRENCY,
): string {
  return formatMinor(Math.max(0, totalMinor), currency);
}

/** Fully mask merchants for Reels (no first/last letter leak). */
export function redactBrandLabelReels(_brand: string | null | undefined): string {
  return "••••";
}

/**
 * Build a shareable found-money card:
 * big total + blurred merchants + worn.app watermark (no card numbers / raw brands).
 * Pass `blurPreset: "reels"` for Reels-safe extra blur (W089).
 */
export function buildFoundMoneyShareCard(input: FoundMoneyShareInput): FoundMoneyShareCard {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const watermark = input.watermark ?? FOUND_MONEY_SHARE_WATERMARK;
  const blurPreset: FoundMoneyBlurPreset = input.blurPreset ?? "standard";
  const now = input.now ?? new Date();
  const totalMinor = Math.max(0, Math.floor(input.totalMinor));
  const accountCount = Math.max(0, Math.floor(input.accountCount));
  const amountLabel = formatFoundMoneyAmount(totalMinor, currency);
  const displayAmountLabel =
    blurPreset === "reels" ? blurFoundMoneyTotalLabel(amountLabel) : amountLabel;

  const seen = new Set<string>();
  const blurredMerchants: string[] = [];
  for (const m of collectMerchants(input)) {
    const label =
      blurPreset === "reels" ? redactBrandLabelReels(m) : redactBrandLabel(m);
    if (seen.has(label)) continue;
    seen.add(label);
    blurredMerchants.push(label);
    if (blurredMerchants.length >= 5) break;
  }

  const daysToNearestExpiry = nearestExpiryDays(input.accounts, now);
  const deadlineLine =
    daysToNearestExpiry === null
      ? null
      : daysToNearestExpiry === 0
        ? "Soonest card expires today."
        : daysToNearestExpiry === 1
          ? "Soonest card expires in 1 day."
          : `Soonest card expires in ${daysToNearestExpiry} days.`;

  const headline =
    totalMinor > 0
      ? `I found ${displayAmountLabel} in forgotten credit`
      : "Checking my forgotten credit";

  // Reels preset omits merchant chips entirely (extra privacy for public feeds).
  const merchantLine =
    blurPreset === "reels"
      ? null
      : blurredMerchants.length > 0
        ? blurredMerchants.join(" · ")
        : null;

  const countLine =
    accountCount > 0
      ? accountCount === 1
        ? "1 gift card / store credit sitting unused."
        : `${accountCount} gift cards & store credits sitting unused.`
      : null;

  const shareText = [headline, countLine, merchantLine, deadlineLine, `— ${watermark}`]
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");

  return {
    totalMinor,
    currency,
    accountCount,
    amountLabel,
    displayAmountLabel,
    blurredMerchants: blurPreset === "reels" ? [] : blurredMerchants,
    watermark,
    headline,
    deadlineLine,
    daysToNearestExpiry,
    shareText,
    blurPreset,
    aspectRatio: blurPreset === "reels" ? "9:16" : "1:1",
  };
}

/**
 * Blur currency digits for WhatsApp forwards (W023) — keeps symbol/separators,
 * replaces every digit so exact balances never leak into group chats.
 */
export function blurFoundMoneyTotalLabel(amountLabel: string): string {
  return amountLabel.replace(/\d/g, "•");
}

export type WhatsAppInFoundMoneyShareInput = {
  totalMinor: number;
  accountCount?: number;
  currency?: string;
  watermark?: string;
  /** Optional referral / landing URL appended (no PII). */
  deepLink?: string | null;
};

export type WhatsAppInFoundMoneyShare = {
  totalMinor: number;
  currency: string;
  amountLabel: string;
  /** Digit-blurred amount for WA text (e.g. ₹•,•••.••). */
  blurredAmountLabel: string;
  watermark: string;
  shareText: string;
  /** `https://wa.me/?text=…` prefilled India WhatsApp share. */
  whatsAppUrl: string;
};

/**
 * W023 — India WhatsApp share template: prefilled text, blurred total,
 * no merchant names / card digits.
 */
export function buildWhatsAppInFoundMoneyShare(
  input: WhatsAppInFoundMoneyShareInput,
): WhatsAppInFoundMoneyShare {
  const currency = input.currency ?? DEFAULT_CURRENCY;
  const watermark = input.watermark ?? FOUND_MONEY_SHARE_WATERMARK;
  const totalMinor = Math.max(0, Math.floor(input.totalMinor));
  const amountLabel = formatFoundMoneyAmount(totalMinor, currency);
  const blurredAmountLabel = blurFoundMoneyTotalLabel(amountLabel);
  const count = Math.max(0, Math.floor(input.accountCount ?? 0));
  const countLine =
    count <= 0
      ? "Gift cards & store credit sitting unused."
      : count === 1
        ? "1 gift card / store credit sitting unused."
        : `${count} gift cards & store credits sitting unused.`;

  const headline =
    totalMinor > 0
      ? `I found ${blurredAmountLabel} in forgotten credit`
      : "Checking my forgotten credit on WORN";

  const shareText = [
    headline,
    countLine,
    input.deepLink?.trim() || null,
    `— ${watermark}`,
  ]
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");

  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return {
    totalMinor,
    currency,
    amountLabel,
    blurredAmountLabel,
    watermark,
    shareText,
    whatsAppUrl,
  };
}
