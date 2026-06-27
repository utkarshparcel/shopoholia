import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import CheckoutScreen from '@/app/checkout';

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/src/hooks/catalog', () => ({
  useCart: () => ({
    query: {
      isLoading: false,
      data: { items: [{ variantId: 'v1' }], coinTotal: 48 },
    },
  }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 } }),
  useCheckout: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('CheckoutScreen', () => {
  it('renders tier selection and pay CTA', () => {
    render(<CheckoutScreen />);
    expect(screen.getByText('Checkout')).toBeTruthy();
    expect(screen.getByText('Pay with coins')).toBeTruthy();
    expect(screen.getByText('Express')).toBeTruthy();
  });
});
