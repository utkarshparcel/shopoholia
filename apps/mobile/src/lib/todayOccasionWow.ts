/**
 * W051–W057 — Today / wardrobe occasion polish helpers (Closet-only).
 * Pure functions for tap budgets, capsule toggle, workwear strip,
 * travel-pack share (no PII), seasonal-swap motion, interview remind,
 * and wedding/festival date-span planning.
 */

/** W051 — Camera → upload → wear must stay within this app-tap budget. */
export const WEAR_PHOTO_MAX_TAPS = 3;

/**
 * Snap & log path: 1) tap CTA → 2) camera capture → 3) confirm/use
 * (native picker may collapse 2–3; we still budget ≤3 app-visible taps).
 */
export function wearPhotoSnapTapBudget(): number {
  return 3;
}

/** True when a snap-then-auto-log path stays within the friction budget. */
export function wearPhotoWithinBudget(appTaps: number): boolean {
  return appTaps >= 1 && appTaps <= WEAR_PHOTO_MAX_TAPS;
}

/** Recoverable error copy when wear-photo upload/log fails. */
export function wearPhotoErrorCopy(message?: string): {
  title: string;
  body: string;
  retryLabel: string;
} {
  return {
    title: 'Could not save wear photo',
    body: message?.trim() || 'Check connection and try again — your look is still here.',
    retryLabel: 'Retry',
  };
}

/** W052 — body flag for generate when “today from capsule” is on. */
export function withCapsulePreference<T extends Record<string, unknown>>(
  body: T,
  preferCapsule: boolean,
): T & { preferCapsule: boolean } {
  return { ...body, preferCapsule };
}

/** W053 — Mon–Fri days that already have a WORK occasion plan. */
export function workwearStripDays<
  T extends { weekday: string; outfit?: { occasion?: string | null } | null },
>(days: T[]): T[] {
  const workdays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  return days.filter(
    (d) => workdays.has(d.weekday) && (d.outfit?.occasion ?? '').toUpperCase() === 'WORK',
  );
}

/** Chip badge for workwear strip days. */
export function workwearDayBadge(occasion: string | null | undefined): string | null {
  return (occasion ?? '').toUpperCase() === 'WORK' ? 'WORK' : null;
}

/** W053 — regenerate should request unique rotation when prior plan was unique. */
export function workwearRegenerateBody(opts?: {
  weekStart?: string;
  unique?: boolean;
}): { weekStart?: string; commit: true; unique: boolean } {
  return {
    ...(opts?.weekStart ? { weekStart: opts.weekStart } : {}),
    commit: true,
    unique: opts?.unique !== false,
  };
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** W054 — scrub emails / phones / ids before share sheet. */
export function sanitizeTravelPackChecklist(markdown: string): string {
  return markdown
    .replace(EMAIL_RE, '[redacted]')
    .replace(PHONE_RE, '[redacted]')
    .replace(UUID_RE, '[id]');
}

export function travelPackSharePayload(checklist: string): {
  message: string;
  dialogTitle: string;
  hasPii: boolean;
} {
  const hasPii =
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(checklist) ||
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(checklist) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      checklist,
    );
  return {
    message: sanitizeTravelPackChecklist(checklist),
    dialogTitle: 'Travel packing list',
    hasPii,
  };
}

/** W055 — motion + haptic plan; Reduce Motion → haptic-only / no animation. */
export function seasonalSwapFeedback(reduceMotion: boolean): {
  haptic: boolean;
  animate: boolean;
  mode: 'motion_haptic' | 'haptic_only' | 'none';
} {
  if (reduceMotion) {
    return { haptic: true, animate: false, mode: 'haptic_only' };
  }
  return { haptic: true, animate: true, mode: 'motion_haptic' };
}

/** W056 — night-before confirm sheet model. */
export function interviewKitRemindConfirm(input: {
  remindAt: string | null;
  eventAt?: string;
  reminderScheduled?: boolean;
}): {
  title: string;
  body: string;
  canEdit: boolean;
  canCancel: boolean;
  actions: Array<'keep' | 'edit' | 'cancel'>;
} {
  if (!input.remindAt) {
    return {
      title: 'Kit saved',
      body: 'Reminder window already passed — kit is ready for the event day.',
      canEdit: true,
      canCancel: false,
      actions: ['keep', 'edit'],
    };
  }
  const when = formatRemindAt(input.remindAt);
  return {
    title: 'Night-before reminder',
    body: `We'll nudge you ${when}. Edit the event time or cancel the reminder.`,
    canEdit: true,
    canCancel: true,
    actions: ['keep', 'edit', 'cancel'],
  };
}

export function formatRemindAt(iso: string, locale = 'en-IN'): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Parse YYYY-MM-DD or datetime into ISO eventAt (noon UTC if date-only). */
export function parseInterviewEventAt(raw: string, fallbackIso?: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return fallbackIso ?? null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T12:00:00.000Z`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** W057 — inclusive day count for wedding/festival span. */
export function weddingFestivalDayCount(startDate: string, endDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return 0;
  }
  if (endDate < startDate) return 0;
  const [ys, ms, ds] = startDate.split('-').map(Number);
  const [ye, me, de] = endDate.split('-').map(Number);
  const start = Date.UTC(ys!, (ms ?? 1) - 1, ds ?? 1);
  const end = Date.UTC(ye!, (me ?? 1) - 1, de ?? 1);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function weddingFestivalPlanSummary(plan: {
  kind: string;
  dayCount: number;
  startDate: string;
  endDate: string;
  envelope?: { status: string; limitMinor?: number } | null;
}): string {
  const span = `${plan.startDate} → ${plan.endDate}`;
  const base = `${plan.dayCount} ${plan.kind} look${plan.dayCount === 1 ? '' : 's'} · ${span}`;
  if (!plan.envelope) return base;
  return `${base} · envelope ${plan.envelope.status}`;
}

export function defaultWeddingSpan(now = new Date()): {
  startDate: string;
  endDate: string;
} {
  const start = new Date(now);
  const end = new Date(now.getTime() + 2 * 86_400_000);
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: toKey(start), endDate: toKey(end) };
}

export function parseDateKey(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}
