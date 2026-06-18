import { describe, expect, it } from 'vitest';

import { buildTrackerSteps, formatCountdown, nextEtaLabel } from './order-tracking';

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
    expect(formatCountdown('2026-06-18T12:04:00.000Z', now)).toBe('4 min');
    expect(nextEtaLabel(baseOrder, now)).toBe('5 min');
  });
});
