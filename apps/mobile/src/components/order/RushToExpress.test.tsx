import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiRequestError,
  fetchCoinBalance,
  rushOrder,
  type OrderSummary,
} from '@/src/api/client';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';

import { RushToExpress } from './RushToExpress';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/src/api/client', () => {
  class ApiRequestError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiRequestError,
    createOrder: vi.fn(),
    fetchCoinBalance: vi.fn(),
    fetchOrder: vi.fn(),
    rushOrder: vi.fn(),
  };
});

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

const ORDER: OrderSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  tier: 'STANDARD',
  state: 'PACKED',
  coinTotal: 48,
  placedAt: '2026-09-29T10:00:00.000Z',
  stateEta: { OUT_FOR_DELIVERY: '2026-09-29T18:00:00.000Z' },
  rushAvailable: true,
  rushCostCoins: 25,
};
const ORDER_KEY = ['order', ORDER.id, 'token'];

function renderRush() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(ORDER_KEY, ORDER);
  render(
    <QueryClientProvider client={client}>
      <RushToExpress order={ORDER} />
    </QueryClientProvider>,
  );
  return client;
}

/** Answers the next dialog by pressing its button labelled `label`. */
function answerDialog(label: string) {
  vi.mocked(Alert.alert).mockImplementationOnce((_title, _message, buttons) => {
    buttons?.find((button) => button.text === label)?.onPress?.();
  });
}

const pressRush = () => fireEvent.click(screen.getByText('Rush to Express · 25 coins'));

describe('RushToExpress', () => {
  beforeEach(() => {
    useSessionStore.setState({ accessToken: 'token', coinBalance: 100 });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('asks before spending coins, and does nothing if you back out', () => {
    renderRush();
    answerDialog('Not now');

    pressRush();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Rush to Express?',
      'Spend 25 coins to move this haul onto the Express schedule.',
      expect.any(Array),
    );
    expect(rushOrder).not.toHaveBeenCalled();
  });

  it('rushes on confirm and takes the new order and balance from the response', async () => {
    const rushed: OrderSummary = { ...ORDER, tier: 'EXPRESS', rushAvailable: false };
    vi.mocked(rushOrder).mockResolvedValueOnce({ order: rushed, balanceAfter: 75 });
    const client = renderRush();
    answerDialog('Rush it');

    pressRush();

    await waitFor(() => expect(useSessionStore.getState().coinBalance).toBe(75));
    expect(rushOrder).toHaveBeenCalledWith('token', ORDER.id);
    expect(client.getQueryData(ORDER_KEY)).toEqual(rushed);
    expect(client.getQueryData(['coins', 'balance', 'token'])).toEqual({ balance: 75 });
    expect(trackEvent).toHaveBeenCalledWith('rush_to_express', {
      orderId: ORDER.id,
      state: 'PACKED',
      coinsSpent: 25,
    });
  });

  it('offers the coin store when the rush is refused for lack of coins', async () => {
    vi.mocked(rushOrder).mockRejectedValueOnce(
      new ApiRequestError(402, 'Rushing to Express costs 25 coins'),
    );
    vi.mocked(fetchCoinBalance).mockResolvedValueOnce({ balance: 10 });
    renderRush();
    answerDialog('Rush it');

    pressRush();

    expect(await screen.findByText('You need 15 more coins to rush this haul.')).toBeTruthy();
    expect(useSessionStore.getState().coinBalance).toBe(10);
    fireEvent.click(screen.getByText('Get 15 coins'));
    expect(push).toHaveBeenCalledWith('/coins/buy');
    // Only the confirm dialog: the coin store offer replaces an error alert.
    expect(Alert.alert).toHaveBeenCalledOnce();
  });

  it('explains any other refusal and reloads the order', async () => {
    vi.mocked(rushOrder).mockRejectedValueOnce(
      new ApiRequestError(409, 'This order is already on the Express schedule'),
    );
    vi.mocked(fetchCoinBalance).mockResolvedValueOnce({ balance: 100 });
    const client = renderRush();
    answerDialog('Rush it');

    pressRush();

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenLastCalledWith(
        'Couldn’t rush',
        'This order is already on the Express schedule',
      ),
    );
    expect(client.getQueryState(ORDER_KEY)?.isInvalidated).toBe(true);
    expect(screen.queryByText(/more coins/)).toBeNull();
  });
});
