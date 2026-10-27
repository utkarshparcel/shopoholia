import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as TanStackQuery from '@tanstack/react-query';

import CheckoutScreen from '@/app/checkout';

const prebuyFixture = vi.hoisted(() => ({
  score: 72,
  summary: 'Looks similar to 1 piece(s) you already own.',
  primaryBudgetNudge: null as null,
  overlaps: [
    {
      candidateTitle: 'Navy Tee',
      wardrobeItemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      wardrobeLabel: 'Zara Tee',
      score: 88,
      reason: 'TITLE' as const,
    },
  ],
  gaps: [] as [],
  budgetNudges: [] as [],
  softBlock: false,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/src/lib/features', () => ({
  FEATURE_CLOSET: true,
}));

vi.mock('@/src/api/client', () => ({
  fetchPrebuyFit: vi.fn().mockResolvedValue(prebuyFixture),
  fetchCredits: vi.fn().mockResolvedValue({ accounts: [] }),
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
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      const key = String(queryKey[0] ?? '');
      if (key === 'credits') {
        return { data: { accounts: [] }, isLoading: false };
      }
      return {
        data: prebuyFixture,
        isLoading: false,
      };
    },
  };
});

vi.mock('@/src/hooks/catalog', () => ({
  useCart: () => ({
    query: {
      isLoading: false,
      data: {
        items: [
          {
            variantId: 'v1',
            title: 'Tee',
            size: 'M',
            color: 'Blue',
            quantity: 1,
            coinPriceSnapshot: 48,
          },
        ],
        coinTotal: 48,
      },
    },
  }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 } }),
  useCheckout: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('CheckoutScreen', () => {
  it('renders tier selection, pay CTA, and Check my closet', () => {
    render(<CheckoutScreen />);
    expect(screen.getByText('Checkout')).toBeTruthy();
    expect(screen.getByText('Pay with coins')).toBeTruthy();
    expect(screen.getByText('Express')).toBeTruthy();
    expect(screen.getByText('Check my closet')).toBeTruthy();
  });

  it('W040 soft dup-rebuy banner + Closet deep link; pay still enabled', () => {
    render(<CheckoutScreen />);
    expect(screen.getByTestId('dup-rebuy-banner')).toBeTruthy();
    expect(screen.getByText(/Already own this/i)).toBeTruthy();
    expect(screen.getByText(/Navy Tee/)).toBeTruthy();
    expect(screen.getByText(/Soft warn only/i)).toBeTruthy();
    expect(screen.getByText('Open Closet')).toBeTruthy();
    const pay = screen.getByRole('button', { name: 'Pay with coins' });
    expect(pay).toBeTruthy();
    expect(pay).not.toBeDisabled();
  });
});
