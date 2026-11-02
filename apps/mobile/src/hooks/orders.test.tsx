import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrder } from '@/src/api/client';

import { haulKeyOf, useCheckout, useOrder } from './orders';

const session = vi.hoisted(() => ({ accessToken: 'token', setCoinBalance: () => undefined }));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (selector: (s: typeof session) => unknown) => selector(session),
    { getState: () => session },
  ),
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
  fetchCoinBalance: vi.fn(async () => ({ balance: 10 })),
}));

vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));

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

describe('useCheckout', () => {
  const HAUL = haulKeyOf([{ variantId: 'v1', quantity: 1 }], 48);
  const ORDER = { id: 'order-1', tier: 'EXPRESS', coinTotal: 48 };

  function renderCheckout(haulKey: string) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(({ haul }) => useCheckout(haul), { wrapper, initialProps: { haul: haulKey } });
  }

  const sentKeys = () => vi.mocked(createOrder).mock.calls.map((call) => call[2]);

  beforeEach(() => {
    vi.mocked(createOrder).mockReset();
  });

  it('retries a checkout with the same idempotency key until an order is placed, then starts a new one', async () => {
    vi.mocked(createOrder)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(ORDER as never);
    const { result } = renderCheckout(HAUL);

    await act(() => result.current.mutateAsync('EXPRESS').catch(() => undefined));
    await act(() => result.current.mutateAsync('EXPRESS').catch(() => undefined));
    // The override retry is still the same checkout.
    await act(() => result.current.mutateAsync({ tier: 'EXPRESS', coolingOffOverride: true }));
    await act(() => result.current.mutateAsync('EXPRESS'));

    const [first, second, third, fourth] = sentKeys();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect([second, third]).toEqual([first, first]);
    expect(fourth).not.toBe(first);
  });

  it('uses a new key when the haul changes', async () => {
    vi.mocked(createOrder).mockRejectedValue(new Error('timeout'));
    const { result, rerender } = renderCheckout(HAUL);

    await act(() => result.current.mutateAsync('EXPRESS').catch(() => undefined));
    rerender({ haul: haulKeyOf([{ variantId: 'v1', quantity: 2 }], 96) });
    await act(() => result.current.mutateAsync('EXPRESS').catch(() => undefined));

    const [first, second] = sentKeys();
    expect(second).not.toBe(first);
  });
});
