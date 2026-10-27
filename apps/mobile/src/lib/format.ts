/**
 * UX-MONEY-FMT — Closet display formatters (₹ grouping, dates, relative times).
 * Prefer these over ad-hoc `toLocale*` so vault / accountant / waste stay consistent.
 */

import {
  formatMinor as formatMinorShared,
  localeForCurrency,
} from '@worn/shared';
import { useCallback } from 'react';

import { useClosetPrefsStore } from './closetPrefs';

export const CLOSET_LOCALE = 'en-IN' as const;

/**
 * Closet money label — uses picker locale for INR / USD / GBP (W003).
 * Pass the amount's own currency when it has one. Without it, the user's chosen currency is used
 * (INR until they pick one), never a hard-coded ₹ (MOB 27).
 * Explicit `locale` still wins when callers pass one.
 */
export function formatMinor(
  minor: number,
  currency?: string | null,
  locale?: string,
): string {
  const code = currency || useClosetPrefsStore.getState().preferredCurrency;
  const resolved = locale ?? localeForCurrency(code);
  return formatMinorShared(minor, code, resolved);
}

/** `formatMinor` for screens: re-renders when the user changes their currency. */
export function useFormatMinor() {
  const preferredCurrency = useClosetPrefsStore((s) => s.preferredCurrency);
  return useCallback(
    (minor: number, currency?: string | null, locale?: string) =>
      formatMinor(minor, currency || preferredCurrency, locale),
    [preferredCurrency],
  );
}

/**
 * The device's local day as `YYYY-MM-DD` (MOB 20). `toISOString().slice(0, 10)` is the UTC day,
 * which in India is still yesterday until 05:30.
 */
export function localDayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Calendar date for Closet money surfaces (gift expiry, receipt purchase, ledger). */
export function formatClosetDate(
  input: string | number | Date,
  locale: string = CLOSET_LOCALE,
): string {
  const d = toDate(input);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Date + time for event logs / ledger stamps. */
export function formatClosetDateTime(
  input: string | number | Date,
  locale: string = CLOSET_LOCALE,
): string {
  const d = toDate(input);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Relative past time — aligned with consent last-sync style
 * (Just now / Nm ago / Nh ago / Nd ago).
 */
export function formatRelativeTime(
  input: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
): string {
  if (input == null || input === '') return '—';
  const t = typeof input === 'number' ? input : Date.parse(String(input instanceof Date ? input.toISOString() : input));
  if (!Number.isFinite(t)) return '—';
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const deltaMs = Math.max(0, nowMs - t);
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function toDate(input: string | number | Date): Date | null {
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}
