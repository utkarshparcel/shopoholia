import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as TanStackQuery from '@tanstack/react-query';

import OrderTrackingScreen from '@/app/order/[id]';

vi.mock('@/src/hooks/reveal', () => ({
  useReveal: (orderId: string) => ({
    data: {
      orderId,
      renders: [],
      rendersWaiting: true,
      expectedReadyAt: '2026-11-05T01:30:00.000Z',
    },
  }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/src/lib/features', () => ({
  FEATURE_CLOSET: true,
}));

vi.mock('@/src/api/client', () => ({
  trackPlayBuyInCloset: vi.fn(),
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) =>
    sel({ accessToken: 'tok' }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = (await vi.importActual(
    '@tanstack/react-query',
  )) as typeof TanStackQuery;
  return {
    ...actual,
    useMutation: () => ({
      mutate: vi.fn(),
      isPending: false,
      data: undefined,
    }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@/src/hooks/orders', () => ({
  useOrder: () => ({
    isLoading: false,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      tier: 'EXPRESS',
      state: 'DELIVERED',
      coinTotal: 48,
      placedAt: '2026-06-18T12:00:00.000Z',
      stateEta: { OUT_FOR_DELIVERY: '2026-06-18T12:05:00.000Z' },
      trackedInCloset: false,
    },
  }),
}));

describe('OrderTrackingScreen, delivered while the reveal waits', () => {
  it('shows when the reveal will be ready instead of a spinner', () => {
    render(<OrderTrackingScreen />);
    const note = screen.getByTestId('order-reveal-wait');
    expect(note.textContent).toMatch(/^Delivered — your reveal is being styled .*ready by about .+\. We'll send you a push\.$/);
  });
});
