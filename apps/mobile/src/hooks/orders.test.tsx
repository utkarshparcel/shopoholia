import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useOrder } from './orders';

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'token' }),
}));

vi.mock('@/src/api/client', () => ({
  fetchOrder: vi.fn(async () => ({
    id: '11111111-1111-4111-8111-111111111111',
    tier: 'EXPRESS',
    state: 'PACKED',
    coinTotal: 48,
    placedAt: '2026-06-18T12:00:00.000Z',
    stateEta: { OUT_FOR_DELIVERY: '2026-06-18T12:05:00.000Z' },
  })),
  createOrder: vi.fn(),
  fetchCoinBalance: vi.fn(),
}));

function OrderProbe({ id }: { id: string }) {
  const order = useOrder(id);
  if (order.isLoading) return <span>loading</span>;
  return <span>{order.data?.state}</span>;
}

describe('useOrder', () => {
  it('loads order state for tracking', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <OrderProbe id="11111111-1111-4111-8111-111111111111" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('PACKED')).toBeTruthy();
    });
  });
});
