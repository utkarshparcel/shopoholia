/**
 * Quiet-hours visual editor helpers (W082-QUIET-HOURS-EDITOR + W025 preview).
 * Prefs are stored as UTC HH:mm — same as push-delivery quiet hours.
 * Preview uses @worn/shared next-send helpers (user TZ).
 */

import {
  formatQuietHoursNextSendPreview,
  nextEligibleSendAt,
} from '@worn/shared';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHhMm(value: string): { hours: number; minutes: number } | null {
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

export function formatHhMm(hours: number, minutes: number): string {
  const h = ((hours % 24) + 24) % 24;
  const min = ((minutes % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Nudge a valid HH:mm by ±stepMinutes (default 30). Invalid input → default. */
export function nudgeQuietHours(
  value: string,
  deltaMinutes: number,
  fallback = '22:00',
): string {
  const parsed = parseHhMm(value) ?? parseHhMm(fallback)!;
  const total = parsed.hours * 60 + parsed.minutes + deltaMinutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return formatHhMm(Math.floor(wrapped / 60), wrapped % 60);
}

export function isValidQuietHoursHhMm(value: string): boolean {
  return parseHhMm(value) != null;
}

/** Instant when quiet hours end (next eligible send). Equals `now` when outside quiet hours. */
export function nextQuietHoursSendAt(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
): Date {
  if (!isValidQuietHoursHhMm(quietHoursStart) || !isValidQuietHoursHhMm(quietHoursEnd)) {
    return new Date(now.getTime());
  }
  return nextEligibleSendAt(now, quietHoursStart, quietHoursEnd);
}

/**
 * W025 — next eligible send preview in the caller's timezone.
 * Delegates to shared `formatQuietHoursNextSendPreview`.
 */
export function formatNextSendPreview(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
  timeZone = 'UTC',
): string {
  if (!isValidQuietHoursHhMm(quietHoursStart) || !isValidQuietHoursHhMm(quietHoursEnd)) {
    return 'Set valid start and end times (HH:mm).';
  }
  return formatQuietHoursNextSendPreview(now, quietHoursStart, quietHoursEnd, {
    timeZone,
    locale: 'en-IN',
  });
}

export const QUIET_HOURS_EDITOR_TITLE = 'Quiet hours';
export const QUIET_HOURS_STEP_MINUTES = 30;
