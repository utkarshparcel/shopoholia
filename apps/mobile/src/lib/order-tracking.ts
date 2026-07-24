import type { OrderState } from '@worn/shared';

export type OrderSummary = {
  id: string;
  tier: 'EXPRESS' | 'STANDARD' | 'SLOW_BURN';
  state: OrderState;
  coinTotal: number;
  placedAt: string;
  stateEta?: Partial<Record<OrderState, string>>;
};

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

export function formatCountdown(targetIso?: string, now = Date.now()): string {
  if (!targetIso) return 'Soon';
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return 'Any moment';
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

export function buildTrackerSteps(order: OrderSummary) {
  return TRACKER_STEPS.map((step) => ({
    id: step.id,
    label: step.label,
    state: stepStateForOrder(step.id, order.state),
    detail:
      step.id === order.state
        ? nextEtaLabel(order)
        : stepStateForOrder(step.id, order.state) === 'todo'
          ? formatCountdown(order.stateEta?.[step.id])
          : undefined,
  }));
}
