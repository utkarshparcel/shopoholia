import { TIER_TIMINGS_PROD, type OrderState } from '@worn/shared';

export type OrderSummary = {
  id: string;
  tier: 'EXPRESS' | 'STANDARD' | 'SLOW_BURN';
  state: OrderState;
  coinTotal: number;
  placedAt: string;
  stateEta?: Partial<Record<OrderState, string>>;
};

/** What the user sees for each delivery tier (checkout's picker and the profile's order list). */
export const TIER_LABELS: Record<OrderSummary['tier'], string> = {
  EXPRESS: 'Express',
  STANDARD: 'Standard',
  SLOW_BURN: 'Slow burn',
};

/**
 * How long a tier takes from checkout to the reveal, in words ("about 2 hours"), from the
 * production delivery timers the API runs at launch (TIER_TIMINGS_PROD), so checkout never
 * promises a pace the server doesn't keep.
 */
export function tierDurationLabel(
  tier: OrderSummary['tier'],
  timings: Record<OrderSummary['tier'], { DELIVERED: number }> = TIER_TIMINGS_PROD,
): string {
  const ms = timings[tier].DELIVERED;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48 || hours % 24 !== 0) return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = hours / 24;
  return `about ${days} days`;
}

export function tierLabel(tier: OrderSummary['tier']): string {
  return TIER_LABELS[tier] ?? tier;
}

/** Where an order row goes: a ready haul opens its reveal, anything else its tracker. */
export function orderHref(
  order: Pick<OrderSummary, 'id' | 'state'>,
): `/reveal/${string}` | `/order/${string}` {
  return order.state === 'REVEAL_READY' ? `/reveal/${order.id}` : `/order/${order.id}`;
}

/** The badge on an order row; a cancelled or failed order is not "in transit". */
export function orderBadgeLabel(state: OrderState): string {
  if (state === 'REVEAL_READY') return 'Ready';
  if (state === 'CANCELLED') return 'Cancelled';
  if (state === 'FAILED') return 'Failed';
  return 'In transit';
}

/**
 * The profile's order list: every order, reveal-ready hauls first (newest first) so none of them
 * is hidden, then the rest in the order the API sent them (newest first). `newestReady` drives the
 * "Open reveal" banner.
 */
export function profileOrderList<T extends Pick<OrderSummary, 'state' | 'placedAt'>>(
  orders: readonly T[],
): { newestReady: T | null; list: T[] } {
  const placed = (o: T) => {
    const t = new Date(o.placedAt).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const ready = orders
    .filter((o) => o.state === 'REVEAL_READY')
    .sort((a, b) => placed(b) - placed(a));
  const rest = orders.filter((o) => o.state !== 'REVEAL_READY');
  return { newestReady: ready[0] ?? null, list: [...ready, ...rest] };
}

export const TRACKER_STEPS: Array<{ id: OrderState; label: string }> = [
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'PACKED', label: 'Packed' },
  { id: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { id: 'ARRIVING_SOON', label: 'Arriving soon' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'REVEAL_READY', label: 'Reveal ready' },
];

const LADDER: OrderState[] = TRACKER_STEPS.map((s) => s.id);

export function stepStateForOrder(
  step: OrderState,
  current: OrderState,
): 'done' | 'current' | 'todo' {
  const stepIdx = LADDER.indexOf(step);
  const currentIdx = LADDER.indexOf(current);
  if (currentIdx < 0 || stepIdx < 0) return 'todo';
  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'current';
  return 'todo';
}

/**
 * Time left until `targetIso`: `m:ss` under 10 minutes (beta stages are 10–120 s apart, so a
 * whole-minute label would sit still while `useNow` ticks every second), `N min` up to an hour,
 * then hours.
 */
export function formatCountdown(targetIso?: string, now = Date.now()): string {
  if (!targetIso) return 'Soon';
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return 'Soon';
  const diff = target - now;
  if (diff <= 0) return 'Any moment';
  const secs = Math.ceil(diff / 1000);
  if (secs < 600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const mins = Math.ceil(diff / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export function nextEtaLabel(order: OrderSummary, now = Date.now()): string {
  if (order.state === 'REVEAL_READY') return 'Open your reveal';
  const currentIdx = LADDER.indexOf(order.state);
  const next = LADDER[currentIdx + 1];
  if (!next) return 'Almost there';
  return formatCountdown(order.stateEta?.[next], now);
}

/** Pass `now` from a ticking clock (`useNow`) so the labels count down between polls. */
export function buildTrackerSteps(order: OrderSummary, now = Date.now()) {
  return TRACKER_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    state: stepStateForOrder(step.id, order.state),
    detail:
      step.id === order.state
        ? nextEtaLabel(order, now)
        : stepStateForOrder(step.id, order.state) === 'todo'
          ? formatCountdown(order.stateEta?.[step.id], now)
          : undefined,
  }));
}
