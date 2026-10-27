/**
 * W016–W022 — found-money vault wow helpers (pure + Reduce Motion–safe).
 * U001–U005 — money-truth chore helpers.
 */

import { formatMinor, normalizeMerchantKey } from '@worn/shared';

import { returnCountdown, type ReturnCountdown } from './returnCountdown';

export type ExpiringAccount = {
  id: string;
  merchant: string;
  expiresAt: string | null;
  balanceCacheMinor: number;
  currency?: string;
  kind?: string;
};

/** W016 — pick the soonest non-null expiry (ASC). Expired still win if soonest. */
export function soonestExpiringAccount<T extends ExpiringAccount>(
  accounts: T[],
  now: Date = new Date(),
): T | null {
  let best: T | null = null;
  let bestMs = Infinity;
  for (const a of accounts) {
    if (!a.expiresAt) continue;
    const t = Date.parse(a.expiresAt);
    if (!Number.isFinite(t)) continue;
    if (t < bestMs) {
      bestMs = t;
      best = a;
    }
  }
  if (!best) return null;
  // Prefer future expiries when any remain; else keep absolute soonest (expired).
  const future = accounts
    .filter((a) => a.expiresAt && Date.parse(a.expiresAt) > now.getTime())
    .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));
  return future[0] ?? best;
}

export type ExpiryCountdownHero = {
  accountId: string;
  merchant: string;
  expiresAt: string;
  countdown: ReturnCountdown;
  /** e.g. "2 days left" / "5 hours left" */
  label: string;
  /** Hero line without card numbers / PII. */
  heroLine: string;
};

/** W016 — soonest-expiry countdown for the vault hero. */
export function expiryCountdownHero(
  accounts: ExpiringAccount[],
  now: Date = new Date(),
): ExpiryCountdownHero | null {
  const account = soonestExpiringAccount(accounts, now);
  if (!account?.expiresAt) return null;
  const countdown = returnCountdown(account.expiresAt, now);
  const heroLine = countdown.expired
    ? `${account.merchant} credit expired — update or remove`
    : `${account.merchant} · ${countdown.label}`;
  return {
    accountId: account.id,
    merchant: account.merchant,
    expiresAt: account.expiresAt,
    countdown,
    label: countdown.label,
    heroLine,
  };
}

/** Deep-link / push focus keys that should land on the expiry countdown hero. */
export function isExpiryHeroFocus(focus: string | undefined | null): boolean {
  return focus === 'expiry' || focus === 'found-money';
}

export const VAULT_EXPIRY_HREF = {
  pathname: '/(closet)/vault' as const,
  params: { focus: 'expiry' as const },
};

/** W017 — next Saturday 10:00 UTC for “use this weekend” reminders. */
export function nextSaturdayMorning(now: Date = new Date(), hourUtc = 10): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  let add = (6 - day + 7) % 7;
  if (add === 0) {
    // Already Saturday — if before hour, keep today; else next week.
    if (d.getUTCHours() >= hourUtc) add = 7;
  }
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function toGoogleCalStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

/** W017 — Google Calendar template URL (no card codes / PII). */
export function weekendReminderCalendarUrl(
  merchant: string,
  now: Date = new Date(),
): string {
  const start = nextSaturdayMorning(now);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const text = encodeURIComponent(`Use ${merchant.trim() || 'store'} credit this weekend`);
  const details = encodeURIComponent('Reminder from WORN vault — spend found money before it expires.');
  const dates = `${toGoogleCalStamp(start)}/${toGoogleCalStamp(end)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&details=${details}&dates=${dates}`;
}

export const USE_THIS_WEEKEND_LABEL = 'Use it this weekend' as const;

/** W017 — show chip when credit has remaining balance and is not expired. */
export function shouldShowWeekendChip(
  account: { balanceCacheMinor: number; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  if (account.balanceCacheMinor <= 0) return false;
  if (!account.expiresAt) return true;
  return Date.parse(account.expiresAt) > now.getTime();
}

/** W018 — toast copy after returning from a merchant deep link (no PII). */
export function deeplinkSuccessToastCopy(): string {
  return 'Merchant opened. Mark spent when you’re done — we never share card numbers.';
}

export type PendingDeeplinkOpen = {
  openedAt: number;
  /** Opaque platform key only — never card numbers. */
  platform: string;
};

const DEEPLINK_RETURN_MIN_MS = 800;

/** W018 — true when app became active after a merchant open. */
export function shouldShowDeeplinkSuccessToast(
  pending: PendingDeeplinkOpen | null,
  nowMs: number = Date.now(),
): boolean {
  if (!pending) return false;
  return nowMs - pending.openedAt >= DEEPLINK_RETURN_MIN_MS;
}

/** W019 — stack visual when ≥3 credits. */
export function shouldShowMultiCardStack(accountCount: number): boolean {
  return accountCount >= 3;
}

/** W019 — a11y label for stack (totals, no card digits). */
export function multiCardStackA11yLabel(
  totalMinor: number,
  accountCount: number,
  currency = 'INR',
): string {
  const total = formatMinor(Math.max(0, totalMinor), currency);
  const n = Math.max(0, accountCount);
  return `${n} credits stacked · ${total} found money`;
}

/** Top layers for the visual stack (soonest expiry first, then balance). */
export function multiCardStackLayers<T extends ExpiringAccount>(
  accounts: T[],
  limit = 3,
  now: Date = new Date(),
): T[] {
  return sortBySoonestExpiry(accounts, now).slice(0, Math.max(1, limit));
}

/** W020 — sort by expiry ASC (nulls last). */
export function sortBySoonestExpiry<T extends ExpiringAccount>(
  accounts: T[],
  _now: Date = new Date(),
): T[] {
  const ranked = accounts.map((a, index) => {
    const t = a.expiresAt ? Date.parse(a.expiresAt) : Number.POSITIVE_INFINITY;
    return { a, index, t: Number.isFinite(t) ? t : Number.POSITIVE_INFINITY };
  });
  ranked.sort((x, y) => {
    if (x.t !== y.t) return x.t - y.t;
    return x.index - y.index;
  });
  return ranked.map((r) => r.a);
}

/** W020 — focus mode keeps only accounts with an expiry date. */
export function filterSoonestFocus<T extends ExpiringAccount>(accounts: T[]): T[] {
  return accounts.filter((a) => Boolean(a.expiresAt));
}

export function applySoonestFocusMode<T extends ExpiringAccount>(
  accounts: T[],
  enabled: boolean,
  now: Date = new Date(),
): T[] {
  const base = enabled ? filterSoonestFocus(accounts) : accounts;
  return enabled ? sortBySoonestExpiry(base, now) : base;
}

/** W021 — balance re-check nudge copy (honest manual path). */
export function balanceRecheckNudgeCopy(merchant: string): {
  title: string;
  body: string;
  recheckCta: string;
  remindCta: string;
  openCta: string;
} {
  const name = merchant.trim() || 'this store';
  return {
    title: `Re-check ${name} balance`,
    body: `Balances drift. Confirm on the merchant site, then update WORN — or set a reminder.`,
    recheckCta: 'Recheck balance',
    remindCta: 'Remind me later',
    openCta: 'Open merchant',
  };
}

export function shouldShowBalanceRecheckNudge(due: boolean | undefined): boolean {
  return Boolean(due);
}

/** U004 — soft-block Use it now when balance is stale. */
export function shouldSoftBlockStaleUseNow(due: boolean | undefined): boolean {
  return Boolean(due);
}

export type VaultMergeSuggestion = {
  targetAccountId: string;
  sourceAccountId: string;
  merchant: string;
  currency: string;
};

/** U002 — client-side merge suggestions (same merchant+currency+kind). */
export function suggestVaultCreditMerges(
  accounts: Array<{
    id: string;
    merchant: string;
    currency: string;
    kind?: string;
    balanceCacheMinor: number;
    status?: string;
    expiresAt?: string | null;
  }>,
): VaultMergeSuggestion[] {
  const byKey = new Map<
    string,
    Array<{
      id: string;
      merchant: string;
      currency: string;
      balanceCacheMinor: number;
      expiresAt?: string | null;
    }>
  >();
  for (const a of accounts) {
    if (a.status === 'CLOSED') continue;
    const kind = a.kind ?? 'GIFT_CARD';
    if (kind !== 'GIFT_CARD' && kind !== 'STORE_CREDIT') continue;
    if (a.balanceCacheMinor <= 0) continue;
    const key = `${normalizeMerchantKey(a.merchant)}|${a.currency}|${kind}`;
    const list = byKey.get(key) ?? [];
    list.push(a);
    byKey.set(key, list);
  }
  const out: VaultMergeSuggestion[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      if (b.balanceCacheMinor !== a.balanceCacheMinor) {
        return b.balanceCacheMinor - a.balanceCacheMinor;
      }
      const ae = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
      const be = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
      return ae - be;
    });
    const target = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      out.push({
        targetAccountId: target.id,
        sourceAccountId: sorted[i]!.id,
        merchant: target.merchant,
        currency: target.currency,
      });
    }
  }
  return out;
}

export type ExpiryChecklistAction = {
  id: 'use' | 'transfer' | 'sell';
  label: string;
  /** Calendar / merchant deep link (no PII). */
  href: string | null;
};

/** U003 — actionable checklist when expiry ≤7d. */
export function expiryActionChecklist(
  account: {
    merchant: string;
    expiresAt: string | null;
    link?: string | null;
    balanceCacheMinor: number;
  },
  now: Date = new Date(),
): ExpiryChecklistAction[] | null {
  if (!account.expiresAt || account.balanceCacheMinor <= 0) return null;
  const countdown = returnCountdown(account.expiresAt, now);
  if (countdown.expired || countdown.daysLeft > 7) return null;
  const merchant = account.merchant.trim() || 'store';
  return [
    {
      id: 'use',
      label: `Use at ${merchant}`,
      href: account.link ?? null,
    },
    {
      id: 'transfer',
      label: 'Set transfer reminder',
      href: expiryTransferCalendarUrl(merchant, account.expiresAt),
    },
    {
      id: 'sell',
      label: 'Set sell / list reminder',
      href: expirySellCalendarUrl(merchant, account.expiresAt),
    },
  ];
}

function expiryCalendarUrl(
  text: string,
  details: string,
  expiresAt: string,
): string {
  const end = new Date(Date.parse(expiresAt));
  const start = new Date(Math.max(Date.now() + 3_600_000, end.getTime() - 2 * 86_400_000));
  const endHour = new Date(start.getTime() + 60 * 60 * 1000);
  const dates = `${toGoogleCalStamp(start)}/${toGoogleCalStamp(endHour)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&details=${encodeURIComponent(details)}&dates=${dates}`;
}

export function expiryTransferCalendarUrl(merchant: string, expiresAt: string): string {
  return expiryCalendarUrl(
    `Transfer ${merchant.trim() || 'store'} credit`,
    'WORN vault reminder — move or gift this credit before it expires.',
    expiresAt,
  );
}

export function expirySellCalendarUrl(merchant: string, expiresAt: string): string {
  return expiryCalendarUrl(
    `List / sell ${merchant.trim() || 'store'} credit`,
    'WORN vault reminder — sell or trade unused credit before expiry.',
    expiresAt,
  );
}

/** U005 — per-currency subtotals (never silent FX). */
export function groupVaultBalancesByCurrency(
  accounts: Array<{ currency?: string; balanceCacheMinor: number }>,
): Array<{ currency: string; totalMinor: number; count: number }> {
  const map = new Map<string, { totalMinor: number; count: number }>();
  for (const a of accounts) {
    const currency = (a.currency ?? 'INR').toUpperCase();
    const cur = map.get(currency) ?? { totalMinor: 0, count: 0 };
    cur.totalMinor += Math.max(0, a.balanceCacheMinor);
    cur.count += 1;
    map.set(currency, cur);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.totalMinor - a.totalMinor || a.currency.localeCompare(b.currency));
}

/** Preferred-currency total only — never sum mixed currencies. */
export function preferredCurrencyTotalMinor(
  accounts: Array<{ currency?: string; balanceCacheMinor: number }>,
  preferredCurrency: string,
): number {
  const pref = preferredCurrency.toUpperCase();
  return accounts
    .filter((a) => (a.currency ?? 'INR').toUpperCase() === pref)
    .reduce((sum, a) => sum + Math.max(0, a.balanceCacheMinor), 0);
}

/** W022 — loyalty / coupon empty → first delight. */
export function loyaltyTabEmptyCopy(kind: 'loyalty' | 'coupons'): {
  title: string;
  body: string;
  cta: string;
} {
  if (kind === 'coupons') {
    return {
      title: 'Park a coupon before it dies',
      body: 'Add one promo code with its deadline — WORN will nudge you before it disappears.',
      cta: 'Add a coupon',
    };
  }
  return {
    title: 'Capture points before they lapse',
    body: 'Add a loyalty balance with an expiry. First points in = your found-money sibling aha.',
    cta: 'Add loyalty points',
  };
}

export function loyaltyFirstCelebrationCopy(
  totalMinor: number,
  kind: 'loyalty' | 'coupons',
  currency = 'INR',
): string {
  const amount = formatMinor(Math.max(0, totalMinor), currency);
  if (kind === 'coupons') {
    return `Coupon saved — ${amount} parked. Spend it before the deadline.`;
  }
  return `First points in — ${amount} loyalty tracked. Use them before they lapse.`;
}

/** Skip motion/haptic delight when Reduce Motion is on. */
export function shouldPlayVaultDelight(reduceMotion: boolean): boolean {
  return !reduceMotion;
}
