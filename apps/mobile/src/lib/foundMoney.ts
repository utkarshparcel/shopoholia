import {
  buildFamilyFoundMoneyShare,
  buildFoundMoneyShareCard,
  buildWhatsAppInFoundMoneyShare,
  buildWhatsAppStatusAsset,
  formatMinorWithPrefs,
  type FamilyFoundMoneyShareCard,
  type FoundMoneyBlurPreset,
  type FoundMoneyShareAccount,
  type FoundMoneyShareCard,
  type FoundMoneyShareInput,
  type WhatsAppInFoundMoneyShare,
  type WhatsAppStatusAsset,
} from '@worn/shared';
import { formatMinor } from '@/src/lib/format';

export {
  buildFoundMoneyShareCard,
  buildFamilyFoundMoneyShare,
  buildReferralDeepLink,
  buildWhatsAppInFoundMoneyShare,
  buildWhatsAppStatusAsset,
  blurFoundMoneyTotalLabel,
  familyShareViaLabel,
  parseFamilyShareReferralCode,
  buildFamilyShareAttributionConfirm,
  FAMILY_SHARE_ORIGIN,
  FOUND_MONEY_SHARE_WATERMARK,
  formatFoundMoneyAmount,
  type FoundMoneyShareAccount,
  type FoundMoneyShareCard,
  type FoundMoneyShareInput,
  type FoundMoneyBlurPreset,
  type FamilyFoundMoneyShareCard,
  type WhatsAppInFoundMoneyShare,
  type WhatsAppStatusAsset,
} from '@worn/shared';

/** Found-money headline for the Vault home aha (W003 prefs-aware). */
export function foundMoneyHeadline(
  totalMinor: number,
  currency = 'INR',
): string {
  if (totalMinor <= 0) {
    return 'No forgotten credit yet';
  }
  return `You have ${formatMinorWithPrefs(totalMinor, { currency })} in forgotten credit.`;
}

/** U005 — short subtotals line; never mixes currencies into one figure. */
export function foundMoneyCurrencySubtotalsLine(
  subtotals: Array<{ currency: string; totalMinor: number }>,
  preferredCurrency: string,
): string | null {
  if (subtotals.length <= 1) return null;
  const pref = preferredCurrency.toUpperCase();
  const parts = subtotals.map((s) => {
    const label = formatMinor(s.totalMinor, s.currency);
    return s.currency.toUpperCase() === pref ? `${label} (preferred)` : label;
  });
  return parts.join(' · ');
}

/** Build a redacted share card from vault accounts (blur merchants + watermark). */
export function foundMoneyShareFromAccounts(
  accounts: Array<{ merchant?: string | null; expiresAt?: string | null; balanceCacheMinor?: number }>,
  opts?: { currency?: string; now?: Date; blurPreset?: FoundMoneyBlurPreset },
): FoundMoneyShareCard {
  const totalMinor = accounts.reduce((sum, a) => sum + (a.balanceCacheMinor ?? 0), 0);
  const shareAccounts: FoundMoneyShareAccount[] = accounts.map((a) => ({
    merchant: a.merchant,
    expiresAt: a.expiresAt,
  }));
  const input: FoundMoneyShareInput = {
    totalMinor,
    accountCount: accounts.length,
    accounts: shareAccounts,
    currency: opts?.currency,
    now: opts?.now,
    blurPreset: opts?.blurPreset,
  };
  return buildFoundMoneyShareCard(input);
}

/**
 * N36 — family WhatsApp share: found-money card + `worn.app/r/{code}` referral link.
 */
export function familyFoundMoneyShareFromAccounts(
  accounts: Array<{ merchant?: string | null; expiresAt?: string | null; balanceCacheMinor?: number }>,
  referralCode: string,
  opts?: { currency?: string; now?: Date; origin?: string },
): FamilyFoundMoneyShareCard {
  const totalMinor = accounts.reduce((sum, a) => sum + (a.balanceCacheMinor ?? 0), 0);
  const shareAccounts: FoundMoneyShareAccount[] = accounts.map((a) => ({
    merchant: a.merchant,
    expiresAt: a.expiresAt,
  }));
  return buildFamilyFoundMoneyShare({
    totalMinor,
    accountCount: accounts.length,
    accounts: shareAccounts,
    currency: opts?.currency,
    now: opts?.now,
    referralCode,
    origin: opts?.origin,
  });
}

/**
 * W023 — India WhatsApp share: blurred total, no merchants/digits in WA text.
 */
export function whatsAppInFoundMoneyShareFromAccounts(
  accounts: Array<{ merchant?: string | null; expiresAt?: string | null; balanceCacheMinor?: number }>,
  opts?: { currency?: string; deepLink?: string | null },
): WhatsAppInFoundMoneyShare {
  const totalMinor = accounts.reduce((sum, a) => sum + (a.balanceCacheMinor ?? 0), 0);
  return buildWhatsAppInFoundMoneyShare({
    totalMinor,
    accountCount: accounts.length,
    currency: opts?.currency,
    deepLink: opts?.deepLink,
  });
}

/** W093 — 9:16 WhatsApp Status asset (no PII). */
export function whatsAppStatusAssetFromAccounts(
  accounts: Array<{ merchant?: string | null; expiresAt?: string | null; balanceCacheMinor?: number }>,
  opts?: { currency?: string; deepLink?: string | null },
): WhatsAppStatusAsset {
  const totalMinor = accounts.reduce((sum, a) => sum + (a.balanceCacheMinor ?? 0), 0);
  return buildWhatsAppStatusAsset({
    totalMinor,
    accountCount: accounts.length,
    merchants: accounts.map((a) => a.merchant),
    currency: opts?.currency,
    deepLink: opts?.deepLink,
  });
}

/** Gift-tab empty body — manual / sample first; email never required for aha. */
export const VAULT_GIFT_EMPTY_BODY =
  'Add one gift card or try a sample — email is optional and only asked after you see found money.';

export function foundMoneySubline(accountCount: number): string {
  if (accountCount <= 0) {
    return 'Add a card or connect email — we’ll surface what you’ve already paid for.';
  }
  if (accountCount === 1) {
    return '1 gift card or store credit sitting unused.';
  }
  return `${accountCount} gift cards & store credits sitting unused.`;
}

/**
 * Wave-1 ethos: copy that mentions both paths must lead with manual/sample
 * before email/Gmail/inbox (Gmail-optional found-money aha).
 */
export function assertsManualBeforeEmail(copy: string): boolean {
  const lower = copy.toLowerCase();
  const emailMarkers = ['connect email', 'gmail', 'inbox'] as const;
  const manualMarkers = [
    'add a card',
    'add one gift',
    'add a gift',
    'manual',
    'try a sample',
    'sample',
  ] as const;
  let emailAt = -1;
  for (const m of emailMarkers) {
    const i = lower.indexOf(m);
    if (i >= 0 && (emailAt < 0 || i < emailAt)) emailAt = i;
  }
  if (emailAt < 0) return true;
  let manualAt = -1;
  for (const m of manualMarkers) {
    const i = lower.indexOf(m);
    if (i >= 0 && (manualAt < 0 || i < manualAt)) manualAt = i;
  }
  return manualAt >= 0 && manualAt < emailAt;
}

export function connectCelebrationCopy(totalMinor: number, currency = 'INR'): string {
  if (totalMinor > 0) {
    return `Inbox connected. We already spotted ${formatMinor(totalMinor, currency)} — spend it before it expires.`;
  }
  return 'Inbox connected. We’re scanning for gift cards, returns, and warranties — check back in a moment.';
}

export type CelebrationSource = 'oauth' | 'manual' | 'demo';

/** Unified celebration after OAuth, manual add, or demo seed (W007 variants). */
export function foundMoneyCelebrationCopy(
  totalMinor: number,
  source: CelebrationSource = 'oauth',
  currency = 'INR',
): string {
  if (source === 'demo') {
    return `Sample unlocked — ${formatMinor(Math.max(totalMinor, 50_000), currency)} Myntra credit is in your vault. Not real money — add a real card anytime.`;
  }
  if (source === 'manual') {
    if (totalMinor > 0) {
      return `Nice — ${formatMinor(totalMinor, currency)} is now in your vault. Spend it before it expires.`;
    }
    return 'Card saved. Your found money lives here.';
  }
  return connectCelebrationCopy(totalMinor, currency);
}
