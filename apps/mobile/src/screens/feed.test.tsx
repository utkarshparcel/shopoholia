import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FeedScreen from '@/app/(tabs)/feed';
import { useFeed } from '@/src/hooks/catalog';

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

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/src/api/client', () => ({ fetchListing: vi.fn() }));

const piece = (id: string, title: string, category: string) => ({
  id,
  title,
  category,
  coinPrice: 499,
  houseModelImageUrl: `https://img.test/${id}.webp`,
});

vi.mock('@/src/hooks/catalog', () => ({
  useFeed: vi.fn(() => ({
    data: {
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
    },
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
  useCart: () => ({ query: { data: { items: [], coinTotal: 0 } }, addMutation: { mutateAsync: vi.fn() } }),
}));

const CHIPS = ['All', 'dresses', 'tops', 'sweaters and sweatshirts', 'co-ords'];

beforeEach(() => {
  vi.mocked(useFeed).mockClear();
});

describe('FeedScreen', () => {
  it('builds chips from the categories endpoint, All first, and lists what the feed returns', () => {
    render(<FeedScreen />);
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    // "co-ords" is only on a loaded item, so it gets no chip; the rest come from the endpoint.
    expect(labels.filter((label) => CHIPS.includes(label))).toEqual(CHIPS.slice(0, 4));

    for (const title of ['Black Solid One Shoulder Top', 'Beige Leopard Print Maxi Dress', 'Brown Solid Crew Neck Co-Ord Set']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('asks the feed for the picked category, and for everything again on All', () => {
    render(<FeedScreen />);
    expect(useFeed).toHaveBeenLastCalledWith(20, null);

    fireEvent.click(screen.getByText('sweaters and sweatshirts'));
    expect(useFeed).toHaveBeenLastCalledWith(20, 'sweaters and sweatshirts');

    fireEvent.click(screen.getByText('All'));
    expect(useFeed).toHaveBeenLastCalledWith(20, null);
  });
});
