import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrderTrackingScreen from '@/app/order/[id]';

const mocks = vi.hoisted(() => ({ rushAvailable: true }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useOrder: () => ({
    isLoading: false,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      tier: 'STANDARD',
      state: 'PACKED',
      coinTotal: 48,
      placedAt: '2026-06-18T12:00:00.000Z',
      stateEta: { OUT_FOR_DELIVERY: '2026-06-18T20:00:00.000Z' },
      rushAvailable: mocks.rushAvailable,
      rushCostCoins: 25,
    },
  }),
  useRushOrder: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  isInsufficientCoinsError: () => false,
}));

describe('OrderTrackingScreen rush', () => {
  it('offers Rush to Express when it would get the order there sooner', () => {
    mocks.rushAvailable = true;
    render(<OrderTrackingScreen />);
    expect(screen.getByText('Rush to Express · 25 coins')).toBeTruthy();
  });

  it('leaves it out when it would not', () => {
    mocks.rushAvailable = false;
    render(<OrderTrackingScreen />);
    expect(screen.getByText('Packed')).toBeTruthy();
    expect(screen.queryByText(/Rush to Express/)).toBeNull();
  });
});
