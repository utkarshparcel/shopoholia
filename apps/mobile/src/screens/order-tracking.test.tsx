import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrderTrackingScreen from '@/app/order/[id]';

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useOrder: () => ({
    isLoading: false,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      tier: 'EXPRESS',
      state: 'PACKED',
      coinTotal: 48,
      placedAt: '2026-06-18T12:00:00.000Z',
      stateEta: { OUT_FOR_DELIVERY: '2026-06-18T12:05:00.000Z' },
    },
  }),
}));

describe('OrderTrackingScreen', () => {
  it('renders tracker with order state', () => {
    render(<OrderTrackingScreen />);
    expect(screen.getByText('Your haul')).toBeTruthy();
    expect(screen.getByText('Packed')).toBeTruthy();
    expect(screen.getByText('Live updates every 5s')).toBeTruthy();
  });
});
