import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FeedScreen from '@/app/(tabs)/feed';
import { fetchListing, type ListingDetail } from '@/src/api/client';
import type * as Ui from '@/src/components/ui';
import type * as Catalog from '@/src/hooks/catalog';
import { listingQueryOptions, useFeed } from '@/src/hooks/catalog';
import { useLookbookStore } from '@/src/stores/lookbook';

const cart = vi.hoisted(() => ({ addToHaul: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
const cardRenders = vi.hoisted(() => [] as string[]);

// The shared react-native mock has no FlatList or Alert, which this screen needs.
// These stand-ins render children only, so RN-only props don't reach the DOM.
vi.mock('react-native', () => {
  const host =
    (tag: string) =>
    ({ children }: React.PropsWithChildren) =>
      React.createElement(tag, null, children);
  return {
    View: host('div'),
    Text: host('span'),
    ScrollView: host('div'),
    Image: () => null,
    ActivityIndicator: () => null,
    Pressable: ({
      children,
      onPress,
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
      onPress?: () => void;
    }) =>
      React.createElement(
        'button',
        { type: 'button', onClick: onPress },
        typeof children === 'function' ? children({ pressed: false }) : children,
      ),
    FlatList: <T,>({
      data,
      keyExtractor,
      renderItem,
      ListEmptyComponent,
    }: {
      data: T[];
      keyExtractor: (item: T) => string;
      renderItem: (info: { item: T; index: number }) => React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        null,
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item, index })),
            ),
      ),
    Alert: { alert: vi.fn() },
    StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
    Platform: {
      OS: 'ios',
      select: <T,>(spec: { ios?: T; native?: T; default?: T }) => spec.ios ?? spec.native ?? spec.default,
    },
    PanResponder: { create: () => ({ panHandlers: {} }) },
  };
});

// One router for every render, as expo-router's is.
vi.mock('expo-router', () => ({
  useRouter: () => router,
}));

// Logs each card drawn, to show which cells re-render.
vi.mock('@/src/components/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof Ui>();
  return {
    ...ui,
    ListingCard: (props: Ui.ListingCardProps) => {
      cardRenders.push(props.title);
      return React.createElement(ui.ListingCard, props);
    },
  };
});

vi.mock('@/src/api/client', () => ({ fetchListing: vi.fn() }));

const piece = (id: string, title: string, category: string) => ({
  id,
  title,
  category,
  coinPrice: 499,
  houseModelImageUrl: `https://img.test/${id}.webp`,
});

// The same data on every render, as React Query keeps it while it's unchanged.
const FEED_DATA = {
  pages: [
    {
      items: [
        piece('a', 'Black Solid One Shoulder Top', 'tops'),
        piece('b', 'Beige Leopard Print Maxi Dress', 'dresses'),
        piece('c', 'Brown Solid Crew Neck Co-Ord Set', 'co-ords'),
      ],
      nextCursor: null,
    },
  ],
};

// The real listing query options, so quick add is checked against the listing screen's cache.
vi.mock('@/src/hooks/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof Catalog>()),
  useFeed: vi.fn(() => ({
    data: FEED_DATA,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  })),
  useFeedCategories: () => ({
    data: {
      categories: [
        { category: 'dresses', count: 27 },
        { category: 'tops', count: 11 },
        { category: 'sweaters and sweatshirts', count: 1 },
      ],
    },
  }),
  useCart: () => ({
    query: { data: { items: [], coinTotal: 0 } },
    addMutation: { mutateAsync: cart.addToHaul },
  }),
}));

const CHIPS = ['All', 'dresses', 'tops', 'sweaters and sweatshirts', 'co-ords'];

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FeedScreen />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  vi.mocked(useFeed).mockClear();
  useLookbookStore.getState().reset();
});

describe('FeedScreen', () => {
  it('builds chips from the categories endpoint, All first, and lists what the feed returns', () => {
    renderFeed();
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    // "co-ords" is only on a loaded item, so it gets no chip; the rest come from the endpoint.
    expect(labels.filter((label) => CHIPS.includes(label))).toEqual(CHIPS.slice(0, 4));

    for (const title of ['Black Solid One Shoulder Top', 'Beige Leopard Print Maxi Dress', 'Brown Solid Crew Neck Co-Ord Set']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('asks the feed for the picked category, and for everything again on All', () => {
    renderFeed();
    expect(useFeed).toHaveBeenLastCalledWith(20, null);

    fireEvent.click(screen.getByText('sweaters and sweatshirts'));
    expect(useFeed).toHaveBeenLastCalledWith(20, 'sweaters and sweatshirts');

    fireEvent.click(screen.getByText('All'));
    expect(useFeed).toHaveBeenLastCalledWith(20, null);
  });

  it('quick add loads the piece into the listing screen’s cache and adds its first size', async () => {
    const detail: ListingDetail = {
      ...piece('a', 'Black Solid One Shoulder Top', 'tops'),
      tags: [],
      variants: [
        { id: 'variant-a', size: 'M', color: 'Black', garmentImageUrl: 'https://img.test/a.png' },
      ],
    };
    vi.mocked(fetchListing).mockResolvedValue(detail);
    const client = renderFeed();

    fireEvent.click(screen.getAllByText('+')[0]!);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Added to haul',
        'Black Solid One Shoulder Top · M',
        expect.any(Array),
      ),
    );
    expect(cart.addToHaul).toHaveBeenCalledWith({ variantId: 'variant-a' });
    expect(fetchListing).toHaveBeenCalledWith('a');
    expect(client.getQueryData(listingQueryOptions('a').queryKey)).toEqual(detail);
  });

  it('redraws only the card whose saved state changed', () => {
    renderFeed();
    cardRenders.length = 0;

    act(() => {
      useLookbookStore.setState({ savedIds: new Set(['b']) });
    });

    expect(cardRenders).toEqual(['Beige Leopard Print Maxi Dress']);
    expect(screen.getAllByText('♥')).toHaveLength(1);
  });
});
