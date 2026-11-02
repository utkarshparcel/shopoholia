import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCoinBalance, fetchReveal, unlockRenders, type RenderCard } from '@/src/api/client';

import { useReveal, useUnlockRenders } from './reveal';

vi.mock('expo-crypto', () => {
  let count = 0;
  return {
    randomUUID: () => `00000000-0000-4000-8000-${String(++count).padStart(12, '0')}`,
  };
});

vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (selector: (s: { accessToken: string; setCoinBalance: () => void }) => unknown) =>
      selector({ accessToken: 'token', setCoinBalance: () => undefined }),
    { getState: () => ({ accessToken: 'token' }) },
  ),
}));

vi.mock('@/src/api/client', () => ({
  fetchCoinBalance: vi.fn(),
  fetchReveal: vi.fn(),
  generateRenders: vi.fn(),
  unlockRenders: vi.fn(),
}));

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function card(id: string, patch: Partial<RenderCard>): RenderCard {
  return {
    id,
    orderItemId: 'item-1',
    scenario: 'STUDIO',
    imageUrl: null,
    isFree: false,
    unlocked: false,
    status: 'DONE',
    ...patch,
  };
}

const free = (status: string) => card('free-1', { isFree: true, unlocked: true, status });
const locked = card('locked-1', { status: 'QUEUED', unlockCostCoins: 50 });
const unlockedPaid = (status: string) => card('paid-1', { unlocked: true, status });

function RevealProbe() {
  useReveal(ORDER_ID);
  return null;
}

/** Mounts the reveal query and reports how many times it fetched over `ms`. */
async function fetchesOver(ms: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RevealProbe />
    </QueryClientProvider>,
  );
  await vi.advanceTimersByTimeAsync(ms);
  return vi.mocked(fetchReveal).mock.calls.length;
}

describe('useReveal polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('does not poll for locked renders, which stay queued until unlocked', async () => {
    vi.mocked(fetchReveal).mockResolvedValue({ orderId: ORDER_ID, renders: [free('DONE'), locked] });
    expect(await fetchesOver(30_000)).toBe(1);
  });

  it('polls every 2.5s while a free render is still generating', async () => {
    vi.mocked(fetchReveal).mockResolvedValue({
      orderId: ORDER_ID,
      renders: [free('RUNNING'), locked],
    });
    expect(await fetchesOver(10_000)).toBe(5);
  });

  it('polls while an unlocked paid render is queued', async () => {
    vi.mocked(fetchReveal).mockResolvedValue({
      orderId: ORDER_ID,
      renders: [free('DONE'), unlockedPaid('QUEUED'), locked],
    });
    expect(await fetchesOver(5_000)).toBe(3);
  });

  it('stops once the unlocked renders are done', async () => {
    vi.mocked(fetchReveal)
      .mockResolvedValueOnce({ orderId: ORDER_ID, renders: [free('RUNNING'), locked] })
      .mockResolvedValue({ orderId: ORDER_ID, renders: [free('DONE'), locked] });
    expect(await fetchesOver(30_000)).toBe(2);
  });
});

describe('useUnlockRenders', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  function mountUnlock() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useUnlockRenders(ORDER_ID), { wrapper }).result;
  }

  it('sends one idempotency key per unlock, the same on a retry and new after success', async () => {
    vi.mocked(fetchCoinBalance).mockResolvedValue({ balance: 100 } as never);
    vi.mocked(unlockRenders)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ renders: [], coinsSpent: 50 });
    const result = mountUnlock();

    await act(async () => {
      await result.current.mutateAsync(['locked-1']).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(['locked-1']);
    });
    await act(async () => {
      await result.current.mutateAsync(['locked-2']);
    });

    const keys = vi.mocked(unlockRenders).mock.calls.map((call) => call[3]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(vi.mocked(unlockRenders).mock.calls[2]?.slice(1, 3)).toEqual([ORDER_ID, ['locked-2']]);
  });
});
