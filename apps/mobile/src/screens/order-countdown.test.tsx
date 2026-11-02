import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TanStackQuery from '@tanstack/react-query';

const T0 = Date.parse('2026-06-18T12:00:00.000Z');

// The same order on every poll, as between two state changes.
const order = vi.hoisted(() => ({
  id: '11111111-1111-4111-8111-111111111111',
  tier: 'EXPRESS',
  state: 'PACKED',
  coinTotal: 48,
  placedAt: '2026-06-18T11:58:00.000Z',
  stateEta: { OUT_FOR_DELIVERY: '2026-06-18T12:02:00.000Z' },
  trackedInCloset: false,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ id: order.id }),
}));

vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: false }));

vi.mock('@/src/api/client', () => ({ trackPlayBuyInCloset: vi.fn() }));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'tok' }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = (await vi.importActual('@tanstack/react-query')) as typeof TanStackQuery;
  return {
    ...actual,
    useMutation: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@/src/hooks/orders', () => ({
  useOrder: () => ({ isLoading: false, data: order }),
}));

import OrderTrackingScreen from '@/app/order/[id]';

describe('order countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps counting down while the polled order stays the same', () => {
    render(<OrderTrackingScreen />);
    expect(screen.getAllByText('2:00').length).toBeGreaterThan(0);

    // Every second shows, not just every minute.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryAllByText('2:00')).toHaveLength(0);
    expect(screen.getAllByText('1:59').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getAllByText('0:59').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getAllByText('Any moment').length).toBeGreaterThan(0);
  });
});
