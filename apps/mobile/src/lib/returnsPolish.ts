/**
 * Wave B returns polish (W031–W036) — pure helpers for ReturnsPanel.
 */

import { returnCountdown } from './returnCountdown';
import { formatMinor } from './format';

export type ReturnSortable = {
  id: string;
  windowDeadline: string;
  state: string;
};

/** Terminal / non-chase states stay in the open list when past deadline. */
function isClosedChaseState(state: string): boolean {
  return state === 'REFUNDED' || state === 'CANCELLED';
}

/**
 * W031 — open returns by window deadline ASC; expired (past deadline / EXPIRED) collapsed.
 */
export function partitionReturnsByDeadline<T extends ReturnSortable>(
  returns: T[],
  now: Date = new Date(),
): { open: T[]; expired: T[] } {
  const open: T[] = [];
  const expired: T[] = [];

  for (const r of returns) {
    const pastDeadline = returnCountdown(r.windowDeadline, now).expired;
    const expiredState = r.state === 'EXPIRED';
    if ((pastDeadline || expiredState) && !isClosedChaseState(r.state)) {
      expired.push(r);
    } else {
      open.push(r);
    }
  }

  const byDeadlineAsc = (a: T, b: T) =>
    Date.parse(a.windowDeadline) - Date.parse(b.windowDeadline) ||
    a.id.localeCompare(b.id);

  // Active chase (soonest first), then closed (REFUNDED/CANCELLED) by deadline.
  open.sort((a, b) => {
    const aClosed = isClosedChaseState(a.state) ? 1 : 0;
    const bClosed = isClosedChaseState(b.state) ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return byDeadlineAsc(a, b);
  });
  expired.sort(byDeadlineAsc);
  return { open, expired };
}

/** W034 — live countdown label for refund ETA (or landed celebration). */
export function refundEtaLiveLabel(
  etaAt: string | null | undefined,
  ledgerCredited: boolean,
  now: Date = new Date(),
): string {
  if (ledgerCredited) return 'Landed in ledger';
  if (!etaAt) return 'ETA —';
  const c = returnCountdown(etaAt, now);
  if (c.expired) return 'ETA overdue — check merchant';
  return `ETA ${c.label}`;
}

/** W035 — mark-refunded celebration copy (haptic + toast body). */
export function markRefundedCelebration(input: {
  refundMinor?: number | null;
  currency?: string;
}): { title: string; body: string; showLedgerHint: boolean } {
  const amount =
    input.refundMinor != null && input.refundMinor > 0
      ? formatMinor(input.refundMinor, input.currency ?? 'INR')
      : null;
  return {
    title: 'Refund landed',
    body: amount
      ? `${amount} posted to your vault ledger.`
      : 'Refund recorded — check Refund ledger in Vault.',
    showLedgerHint: true,
  };
}

const PICKUP_HOUR_UTC = 10;
const PICKUP_HOUR_ALT_UTC = 14;

/**
 * W033 — suggest upcoming pickup slots (calendar chips).
 * Uses UTC hours so tests stay deterministic; UI formats with formatClosetDateTime.
 */
export function suggestPickupSlots(now: Date = new Date(), count = 4): string[] {
  const slots: string[] = [];
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  // Start from tomorrow so same-day rush slots aren't forced.
  for (let day = 1; slots.length < count && day < 14; day++) {
    for (const hour of [PICKUP_HOUR_UTC, PICKUP_HOUR_ALT_UTC]) {
      if (slots.length >= count) break;
      const slot = new Date(start.getTime() + day * 86_400_000);
      slot.setUTCHours(hour, 0, 0, 0);
      if (slot.getTime() <= now.getTime()) continue;
      slots.push(slot.toISOString());
    }
  }
  return slots;
}

/** Nudge a pickup ISO datetime by whole hours (calendar stepper). */
export function nudgePickupSlotHours(iso: string, deltaHours: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + deltaHours * 3_600_000).toISOString();
}

export const SIZE_MAP_TIP_DISMISS_EVENT = 'size_map_tip_dismiss' as const;
export const RETURN_PORTAL_OPEN_EVENT = 'return_portal_open' as const;

/** W032 — analytics props when opening merchant return portal. */
export function returnPortalOpenProps(
  returnId: string,
  merchant?: string | null,
): { returnId: string; merchant?: string } {
  const props: { returnId: string; merchant?: string } = { returnId };
  const m = merchant?.trim();
  if (m) props.merchant = m;
  return props;
}
