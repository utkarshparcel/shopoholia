import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFeed } from './catalog';

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
}));

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
