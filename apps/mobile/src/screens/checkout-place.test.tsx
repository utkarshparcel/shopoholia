import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    back: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    dismissAll: vi.fn(),
    canDismiss: vi.fn(() => true),
  },
  calls: [] as string[],
  fetchConsents: vi.fn(),
  fetchCredits: vi.fn(async () => ({ accounts: [] })),
  mutateAsync: vi.fn(async () => ({ id: 'order-1' })),
}));

vi.mock('expo-router', () => ({ useRouter: () => mocks.router }));

vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: true }));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'tok' }),
}));

vi.mock('@/src/api/client', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  fetchConsents: mocks.fetchConsents,
  fetchCredits: mocks.fetchCredits,
  fetchPrebuyFit: vi.fn(async () => ({
    score: 0,
    summary: '',
    primaryBudgetNudge: null,
    overlaps: [],
    gaps: [],
    budgetNudges: [],
    softBlock: false,
  })),
}));

vi.mock('@/src/hooks/catalog', () => ({
  useCart: () => ({
    query: {
      isLoading: false,
      data: {
        items: [
          { variantId: 'v1', title: 'Tee', size: 'M', color: 'Blue', quantity: 1, coinPriceSnapshot: 48 },
        ],
        coinTotal: 48,
      },
      refetch: vi.fn(),
    },
  }),
}));

vi.mock('@/src/hooks/orders', () => ({
  useCoinBalance: () => ({ data: { balance: 500 } }),
  useCheckout: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
  haulKeyOf: () => 'haul',
}));

import CheckoutScreen from '@/app/checkout';

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CheckoutScreen />
    </QueryClientProvider>,
  );
}

function grants(...scopes: string[]) {
  return { grants: scopes.map((scope) => ({ scope, revokedAt: null })) };
}

describe('CheckoutScreen', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    for (const key of ['back', 'replace', 'push', 'dismissAll'] as const) {
      mocks.router[key].mockReset();
      mocks.router[key].mockImplementation((...args: unknown[]) => {
        mocks.calls.push(`${key}${args.length ? ` ${String(args[0])}` : ''}`);
      });
    }
    mocks.router.canDismiss.mockReturnValue(true);
    mocks.fetchConsents.mockReset();
    mocks.fetchCredits.mockClear();
  });

  it('opens a placed order on top of the app, leaving no cart or checkout modal behind', async () => {
    mocks.fetchConsents.mockResolvedValue(grants());
    renderCheckout();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pay with coins' }));
    });
    expect(mocks.calls).toEqual(['dismissAll', 'push /order/order-1']);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
