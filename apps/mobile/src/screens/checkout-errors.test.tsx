import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class ApiRequestError extends Error {
    status: number;
    code: string | null;
    constructor(status: number, message: string, code: string | null = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiRequestError,
    router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), dismissAll: vi.fn(), canDismiss: () => true },
    mutateAsync: vi.fn(),
    refetchCart: vi.fn(),
    refetchBalance: vi.fn(),
  };
});

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: false, FEATURE_CASHBACK: false }));
vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'tok' }),
}));
vi.mock('@/src/api/client', () => ({
  ApiRequestError: mocks.ApiRequestError,
  fetchConsents: vi.fn(async () => ({ grants: [] })),
  fetchCredits: vi.fn(),
  fetchPrebuyFit: vi.fn(),
}));
vi.mock('@/src/hooks/catalog', () => ({
  useCart: () => ({
    query: {
      isLoading: false,
      data: {
        items: [{ variantId: 'v1', title: 'Tee', size: 'M', color: 'Blue', quantity: 1, coinPriceSnapshot: 48 }],
        coinTotal: 48,
      },
      refetch: mocks.refetchCart,
    },
  }),
}));
vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 }, refetch: mocks.refetchBalance }),
  useCheckout: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
  haulKeyOf: () => 'haul',
  isInsufficientCoinsError: (e: unknown) => e instanceof mocks.ApiRequestError && e.status === 402,
}));

import CheckoutScreen from '@/app/checkout';

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CheckoutScreen />
    </QueryClientProvider>,
  );
}

async function pay() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Pay with coins' }));
  });
}

beforeEach(() => {
  vi.mocked(Alert.alert).mockReset();
  mocks.mutateAsync.mockReset();
  mocks.refetchCart.mockReset();
  mocks.refetchBalance.mockReset();
  mocks.router.push.mockReset();
});

describe('CheckoutScreen errors', () => {
  it('says why an order could not be placed (an emptied haul), and reloads haul and balance', async () => {
    mocks.mutateAsync.mockRejectedValue(new mocks.ApiRequestError(400, 'Your cart is empty', 'EMPTY_CART'));
    renderCheckout();
    await pay();

    expect(Alert.alert).toHaveBeenCalledWith('Couldn’t place your order', 'Your cart is empty');
    expect(mocks.refetchCart).toHaveBeenCalled();
    expect(mocks.refetchBalance).toHaveBeenCalled();
  });

  it('puts a lost connection in plain words', async () => {
    mocks.mutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));
    renderCheckout();
    await pay();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Couldn’t place your order',
      'Could not reach WORN. Check your connection and try again.',
    );
  });

  it('offers the coin store when the balance was not enough after all (402)', async () => {
    mocks.mutateAsync.mockRejectedValue(new mocks.ApiRequestError(402, 'Insufficient coins'));
    renderCheckout();
    await pay();

    const [title, , buttons] = vi.mocked(Alert.alert).mock.lastCall as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>,
    ];
    expect(title).toBe('Not enough coins');
    act(() => buttons.find((b) => b.text === 'Get coins')!.onPress!());
    await vi.waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/coins/buy'));
  });

  it('shows the real delivery times, not the beta minutes', () => {
    renderCheckout();
    expect(screen.getByText('Fastest arc — about 2 hours')).toBeTruthy();
    expect(screen.getByText('Balanced pace — about 12 hours')).toBeTruthy();
    expect(screen.getByText('Maximum anticipation — about 2 days')).toBeTruthy();
    expect(screen.queryByText(/beta|min\b/)).toBeNull();
  });
});
