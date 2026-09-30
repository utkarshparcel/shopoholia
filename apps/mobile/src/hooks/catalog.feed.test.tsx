import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchFeed } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

import { useFeed, useFeedCategories } from './catalog';

vi.mock('@/src/api/client', () => ({
  fetchFeed: vi.fn(
    async (
      _cursor?: string,
      _limit?: number,
      _sellerId?: string,
      options?: { category?: string | null; accessToken?: string | null },
    ) => ({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: `${options?.category ?? 'all'} for ${options?.accessToken ?? 'guest'}`,
          category: options?.category ?? 'tops',
          coinPrice: 48,
          houseModelImageUrl: 'https://r2.mock.worn.test/house-models/1.jpg',
        },
      ],
      nextCursor: null,
    }),
  ),
  fetchFeedCategories: vi.fn(async () => ({
    categories: [
      { category: 'dresses', count: 27 },
      { category: 'tops', count: 11 },
    ],
  })),
}));

function withClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function FeedProbe({ category }: { category: string | null }) {
  const feed = useFeed(20, category);
  const titles = feed.data?.pages.flatMap((page) => page.items.map((item) => item.title)) ?? [];
  return <span>{feed.isLoading ? 'loading' : titles.join(', ')}</span>;
}

function CategoriesProbe() {
  const { data } = useFeedCategories();
  return <span>{data ? data.categories.map((c) => `${c.category}:${c.count}`).join(' ') : 'loading'}</span>;
}

beforeEach(() => {
  vi.mocked(fetchFeed).mockClear();
  useSessionStore.getState().clear();
});

describe('useFeed', () => {
  it('fetches the chosen category and refetches when it changes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <FeedProbe category="dresses" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('dresses for guest')).toBeTruthy());
    expect(fetchFeed).toHaveBeenLastCalledWith(undefined, 20, undefined, {
      category: 'dresses',
      accessToken: null,
    });

    view.rerender(
      <QueryClientProvider client={client}>
        <FeedProbe category="tops" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('tops for guest')).toBeTruthy());
    expect(fetchFeed).toHaveBeenCalledTimes(2);
  });

  it('refetches with the access token once the shopper signs in', async () => {
    render(withClient(<FeedProbe category={null} />));
    await waitFor(() => expect(screen.getByText('all for guest')).toBeTruthy());

    act(() => {
      useSessionStore.getState().setSession({ accessToken: 'token-123', refreshToken: 'refresh' });
    });
    await waitFor(() => expect(screen.getByText('all for token-123')).toBeTruthy());
    expect(fetchFeed).toHaveBeenLastCalledWith(undefined, 20, undefined, {
      category: null,
      accessToken: 'token-123',
    });
  });
});

describe('useFeedCategories', () => {
  it('loads the category chips from the API', async () => {
    render(withClient(<CategoriesProbe />));
    await waitFor(() => expect(screen.getByText('dresses:27 tops:11')).toBeTruthy());
  });
});
