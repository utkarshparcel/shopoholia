import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StreaksScreen from '@/app/streaks';
import { orderKeys } from '@/src/hooks/orders';
import { useSessionStore } from '@/src/stores/session';

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: () => true }),
}));

vi.mock('@/src/api/client', () => ({
  getStreak: vi.fn(async () => ({ currentStreak: 2, todayClaimed: false, nextRewardCoins: 25 })),
  claimStreak: vi.fn(async () => ({ currentStreak: 3, coinsGranted: 25, balanceAfter: 525 })),
}));

/** An unsigned JWT for user `sub`, shaped like the API's access tokens. */
const jwt = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.s`;

afterEach(() => useSessionStore.getState().clear());

describe('StreaksScreen', () => {
  it('a claim updates the balance every other screen shows (Profile, checkout, Rush)', async () => {
    useSessionStore.getState().setSession({ accessToken: jwt('user-1'), refreshToken: 'r' });
    useSessionStore.getState().setCoinBalance(500);
    const client = new QueryClient();
    client.setQueryData(orderKeys.balance('user-1'), { balance: 500 });
    render(
      <QueryClientProvider client={client}>
        <StreaksScreen />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText('Claim coins'));

    await screen.findByText('Balance: 525 coins');
    await waitFor(() => expect(useSessionStore.getState().coinBalance).toBe(525));
    expect(client.getQueryData(orderKeys.balance('user-1'))).toEqual({ balance: 525 });
  });
});
