import { describe, expect, it } from 'vitest';

import {
  buildTrackerSteps,
  formatCountdown,
  nextEtaLabel,
  orderBadgeLabel,
  orderHref,
  profileOrderList,
  tierLabel,
  type OrderSummary,
} from './order-tracking';

describe('order-tracking', () => {
  const baseOrder = {
    id: '11111111-1111-4111-8111-111111111111',
    tier: 'EXPRESS' as const,
    state: 'PACKED' as const,
    coinTotal: 48,
    placedAt: '2026-06-18T12:00:00.000Z',
    stateEta: {
      OUT_FOR_DELIVERY: '2026-06-18T12:05:00.000Z',
    },
  };

  it('builds tracker steps with current state', () => {
    const steps = buildTrackerSteps(baseOrder);
    expect(steps.find((s) => s.id === 'PROCESSING')?.state).toBe('done');
    expect(steps.find((s) => s.id === 'PACKED')?.state).toBe('current');
  });

  it('formats countdown labels', () => {
    const now = new Date('2026-06-18T12:00:00.000Z').getTime();
    expect(formatCountdown('2026-06-18T12:04:00.000Z', now)).toBe('4:00');
    expect(nextEtaLabel(baseOrder, now)).toBe('5:00');
  });

  it('counts seconds under 10 minutes so short beta stages visibly tick', () => {
    const now = new Date('2026-06-18T12:00:00.000Z').getTime();
    expect(formatCountdown('2026-06-18T12:01:07.000Z', now)).toBe('1:07');
    expect(formatCountdown('2026-06-18T12:01:07.000Z', now + 1000)).toBe('1:06');
    expect(formatCountdown('2026-06-18T12:00:09.000Z', now)).toBe('0:09');
    // A partial second rounds up, so it never shows 0:00 while time remains.
    expect(formatCountdown('2026-06-18T12:00:00.400Z', now)).toBe('0:01');
    expect(formatCountdown('2026-06-18T12:09:59.000Z', now)).toBe('9:59');
  });

  it('uses minutes from 10 minutes and hours from an hour', () => {
    const now = new Date('2026-06-18T12:00:00.000Z').getTime();
    expect(formatCountdown('2026-06-18T12:10:00.000Z', now)).toBe('10 min');
    expect(formatCountdown('2026-06-18T12:23:30.000Z', now)).toBe('24 min');
    expect(formatCountdown('2026-06-18T13:00:00.000Z', now)).toBe('1h');
    expect(formatCountdown('2026-06-18T13:25:00.000Z', now)).toBe('1h 25m');
  });

  it('keeps the no-ETA and past handling', () => {
    const now = new Date('2026-06-18T12:00:00.000Z').getTime();
    expect(formatCountdown(undefined, now)).toBe('Soon');
    expect(formatCountdown('2026-06-18T12:00:00.000Z', now)).toBe('Any moment');
    expect(formatCountdown('2026-06-18T11:59:00.000Z', now)).toBe('Any moment');
  });
});

describe('profile order list', () => {
  const order = (id: string, state: OrderSummary['state'], placedAt: string) => ({
    id,
    tier: 'STANDARD' as const,
    state,
    coinTotal: 10,
    placedAt,
  });

  it('lists every reveal-ready order, not just one, and banners the newest', () => {
    const orders = [
      order('transit', 'PACKED', '2026-06-18T12:05:00.000Z'),
      order('ready-old', 'REVEAL_READY', '2026-06-18T12:00:00.000Z'),
      order('ready-new', 'REVEAL_READY', '2026-06-18T12:03:00.000Z'),
      order('ready-mid', 'REVEAL_READY', '2026-06-18T12:01:00.000Z'),
    ];
    const { newestReady, list } = profileOrderList(orders);
    expect(newestReady?.id).toBe('ready-new');
    expect(list.map((o) => o.id)).toEqual(['ready-new', 'ready-mid', 'ready-old', 'transit']);
  });

  it('keeps more than five orders so none become unreachable', () => {
    const orders = Array.from({ length: 7 }, (_, i) =>
      order(`r${i}`, 'REVEAL_READY', `2026-06-18T12:0${i}:00.000Z`),
    );
    expect(profileOrderList(orders).list).toHaveLength(7);
  });

  it('has no banner when nothing is ready', () => {
    const { newestReady, list } = profileOrderList([
      order('a', 'PROCESSING', '2026-06-18T12:00:00.000Z'),
    ]);
    expect(newestReady).toBeNull();
    expect(list.map((o) => o.id)).toEqual(['a']);
  });

  it('routes ready orders to the reveal and the rest to the tracker', () => {
    expect(orderHref({ id: 'x', state: 'REVEAL_READY' })).toBe('/reveal/x');
    expect(orderHref({ id: 'y', state: 'OUT_FOR_DELIVERY' })).toBe('/order/y');
  });

  it('labels tiers and badges for people, not enums', () => {
    expect(tierLabel('SLOW_BURN')).toBe('Slow burn');
    expect(tierLabel('EXPRESS')).toBe('Express');
    expect(tierLabel('STANDARD')).toBe('Standard');
    expect(orderBadgeLabel('REVEAL_READY')).toBe('Ready');
    expect(orderBadgeLabel('PACKED')).toBe('In transit');
    expect(orderBadgeLabel('CANCELLED')).toBe('Cancelled');
  });
});
