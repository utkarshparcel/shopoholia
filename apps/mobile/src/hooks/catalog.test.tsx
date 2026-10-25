import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addToCart, fetchCart, requestTryon, type TryonResponse } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

import { cartKey, useAddToCart, useFeed, useTryon } from './catalog';

vi.mock('@/src/api/client', () => ({
  fetchFeed: vi.fn(async (cursor?: string) => ({
    items: cursor
      ? []
      : [
          {
            id: '11111111-1111-4111-8111-111111111111',
            title: 'Totême wool coat',
            category: 'Outerwear',
            coinPrice: 48,
            houseModelImageUrl: 'https://r2.mock.worn.test/house-models/1.jpg',
          },
        ],
    nextCursor: cursor ? null : '11111111-1111-4111-8111-111111111111',
  })),
  addToCart: vi.fn(),
  fetchCart: vi.fn(),
  requestTryon: vi.fn(),
}));

vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));

const TOKEN = `h.${btoa(JSON.stringify({ sub: 'user-1' })).replace(/=+$/, '')}.sig`;
const PROCESSING: TryonResponse = { status: 'PROCESSING', previewUrl: null };
const READY: TryonResponse = { status: 'READY', previewUrl: 'https://r2.mock.worn.test/tryon/1.jpg' };

function hookWrapper(client = new QueryClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderTryon() {
  return renderHook(({ variantId }) => useTryon('listing-1', variantId), {
    wrapper: hookWrapper(),
    initialProps: { variantId: 'variant-1' },
  });
}

function FeedProbe() {
  const feed = useFeed(20);
  if (feed.isLoading) return <span>loading</span>;
  const count = feed.data?.pages.flatMap((page) => page.items).length ?? 0;
  return <span>{count} items</span>;
}

describe('useFeed', () => {
  it('loads paginated feed items', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FeedProbe />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('1 items')).toBeTruthy();
    });
  });
});

describe('useTryon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSessionStore.getState().setSession({ accessToken: TOKEN, refreshToken: 'refresh' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(requestTryon).mockReset();
    useSessionStore.getState().clear();
  });

  it('asks again every 2s while the try-on is processing, then shows it', async () => {
    vi.mocked(requestTryon)
      .mockResolvedValueOnce(PROCESSING)
      .mockResolvedValueOnce(PROCESSING)
      .mockResolvedValue(READY);
    const { result } = renderTryon();

    act(() => {
      void result.current.mutateAsync();
    });
    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(requestTryon).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(requestTryon).toHaveBeenCalledTimes(3);
    expect(requestTryon).toHaveBeenLastCalledWith(TOKEN, 'listing-1', 'variant-1');
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toEqual(READY);

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(requestTryon).toHaveBeenCalledTimes(3);
  });

  it('gives up after a minute, with a failure that is not about the avatar', async () => {
    vi.mocked(requestTryon).mockResolvedValue(PROCESSING);
    const { result } = renderTryon();

    let failure: unknown;
    act(() => {
      result.current.mutateAsync().catch((error: unknown) => {
        failure = error;
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(failure).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(requestTryon).toHaveBeenCalledTimes(31);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/longer than usual/);
    expect((failure as Error).message).not.toMatch(/avatar/i);

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(requestTryon).toHaveBeenCalledTimes(31);
  });

  it('stops asking once the screen goes away, and drops a request still out without failing', async () => {
    let failRequest: (error: Error) => void = () => undefined;
    vi.mocked(requestTryon)
      .mockResolvedValueOnce(PROCESSING)
      .mockImplementationOnce(
        () =>
          new Promise<TryonResponse>((_resolve, reject) => {
            failRequest = reject;
          }),
      )
      .mockResolvedValue(PROCESSING);
    const { result, unmount } = renderTryon();

    let outcome: Promise<string> = Promise.resolve('not started');
    act(() => {
      outcome = result.current.mutateAsync().then(
        () => 'resolved',
        () => 'rejected',
      );
    });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(requestTryon).toHaveBeenCalledTimes(2);

    unmount();
    failRequest(new Error('Network request failed'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(requestTryon).toHaveBeenCalledTimes(2);
    expect(await outcome).toBe('resolved');
  });

  it('drops a processing try-on when another size is picked', async () => {
    vi.mocked(requestTryon).mockResolvedValue(PROCESSING);
    const { result, rerender } = renderTryon();

    act(() => {
      void result.current.mutateAsync();
    });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(requestTryon).toHaveBeenCalledTimes(2);

    rerender({ variantId: 'variant-2' });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(requestTryon).toHaveBeenCalledTimes(2);
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe('useAddToCart', () => {
  afterEach(() => {
    useSessionStore.getState().clear();
  });

  it('caches the haul it gets back without fetching the haul', async () => {
    const haul = { items: [], coinTotal: 48 };
    vi.mocked(addToCart).mockResolvedValue(haul);
    useSessionStore.getState().setSession({ accessToken: TOKEN, refreshToken: 'refresh' });
    const client = new QueryClient();
    const { result } = renderHook(() => useAddToCart(), { wrapper: hookWrapper(client) });

    await act(() => result.current.mutateAsync({ variantId: 'variant-a' }));

    expect(addToCart).toHaveBeenCalledWith(TOKEN, 'variant-a', 1);
    expect(fetchCart).not.toHaveBeenCalled();
    expect(client.getQueryData(cartKey('user-1'))).toEqual(haul);
  });
});
