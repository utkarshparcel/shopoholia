import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goBack } from '@/src/lib/goBack';

/**
 * A screen whose data failed to load says so and offers a retry (or a way out for a 404),
 * instead of spinning forever or claiming the haul is empty / the piece doesn't exist.
 */

const m = vi.hoisted(() => {
  class ApiRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiRequestError,
    router: { back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: vi.fn(() => true) },
    order: {} as Record<string, unknown>,
    reveal: {} as Record<string, unknown>,
    listing: {} as Record<string, unknown>,
    cart: {} as Record<string, unknown>,
    remove: { mutate: vi.fn(), isPending: false, variables: undefined as string | undefined },
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => m.router,
  useLocalSearchParams: () => ({
    id: '11111111-1111-4111-8111-111111111111',
    orderId: '11111111-1111-4111-8111-111111111111',
  }),
}));
vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: false, FEATURE_CASHBACK: false }));
vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string; coinBalance: number }) => unknown) =>
    sel({ accessToken: 'tok', coinBalance: 100 }),
}));
vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/src/api/client', () => ({
  ApiRequestError: m.ApiRequestError,
  trackPlayBuyInCloset: vi.fn(),
  submitRevealRating: vi.fn(),
  recordAffiliateClick: vi.fn(async () => null),
}));
vi.mock('@/src/hooks/orders', () => ({
  useOrder: () => m.order,
  useCoinBalance: () => ({ data: { balance: 100 } }),
  isInsufficientCoinsError: () => false,
  useRushOrder: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/src/hooks/reveal', () => ({
  useReveal: () => m.reveal,
  useUnlockRenders: () => ({ mutateAsync: vi.fn() }),
  useGenerateRenders: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/src/hooks/catalog', () => ({
  useListing: () => m.listing,
  useAddToCart: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTryon: () => ({ mutateAsync: vi.fn(), isPending: false, data: undefined }),
  useCart: () => ({ query: m.cart, removeMutation: m.remove }),
}));

import CartScreen from '@/app/cart';
import ListingDetailScreen from '@/app/listing/[id]';
import OrderTrackingScreen from '@/app/order/[id]';
import RevealScreen from '@/app/reveal/[orderId]';
import NotFoundScreen from '@/app/+not-found';

function renderScreen(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const failed = (error: unknown) => ({
  isLoading: false,
  isError: true,
  data: undefined,
  error,
  refetch: vi.fn(),
});

beforeEach(() => {
  for (const fn of [m.router.back, m.router.push, m.router.replace]) fn.mockReset();
  m.router.canGoBack.mockReturnValue(true);
  vi.mocked(Alert.alert).mockReset();
});

describe('order tracker', () => {
  it('says it could not load and retries, instead of spinning forever', () => {
    m.order = failed(new TypeError('Failed to fetch'));
    renderScreen(<OrderTrackingScreen />);

    expect(screen.getByText('Couldn’t load your order')).toBeTruthy();
    expect(screen.getByText('Could not reach WORN. Check your connection and try again.')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(m.order.refetch).toHaveBeenCalled();
  });

  it('a link to an order that isn’t this account’s says so and leads to the orders', () => {
    m.order = failed(new m.ApiRequestError(404, 'Order not found'));
    renderScreen(<OrderTrackingScreen />);

    expect(screen.getByText('Order not found')).toBeTruthy();
    fireEvent.click(screen.getByText('See your orders'));
    expect(m.router.replace).toHaveBeenCalledWith('/(tabs)/profile');
  });

  it('Back from a tracker opened by a link (no history) goes to the feed', () => {
    m.order = failed(new m.ApiRequestError(404, 'Order not found'));
    m.router.canGoBack.mockReturnValue(false);
    renderScreen(<OrderTrackingScreen />);

    fireEvent.click(screen.getByText('← Back'));
    expect(m.router.back).not.toHaveBeenCalled();
    expect(m.router.replace).toHaveBeenCalledWith('/(tabs)/feed');
  });
});

describe('reveal', () => {
  it('says it could not load and retries, instead of spinning forever', () => {
    m.reveal = failed(new m.ApiRequestError(503, 'Service Unavailable'));
    renderScreen(<RevealScreen />);

    expect(screen.getByText('Couldn’t load your reveal')).toBeTruthy();
    expect(screen.getByText('The server had a problem. Try again in a moment.')).toBeTruthy();
    expect(screen.queryByText('Swipe the deck to browse your scenes.')).toBeNull();
    fireEvent.click(screen.getByText('Try again'));
    expect(m.reveal.refetch).toHaveBeenCalled();
  });

  it('a reveal that isn’t this account’s says so', () => {
    m.reveal = failed(new m.ApiRequestError(404, 'Not found'));
    renderScreen(<RevealScreen />);
    expect(screen.getByText('Reveal not found')).toBeTruthy();
  });
});

describe('listing', () => {
  it('a network failure is not "Listing not found": it offers a retry', () => {
    m.listing = failed(new TypeError('Network request failed'));
    renderScreen(<ListingDetailScreen />);

    expect(screen.queryByText('Listing not found')).toBeNull();
    expect(screen.getByText('Couldn’t load this piece')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(m.listing.refetch).toHaveBeenCalled();
  });

  it('a removed piece says it is not found and leads back to the feed', () => {
    m.listing = failed(new m.ApiRequestError(404, 'Listing not found'));
    renderScreen(<ListingDetailScreen />);

    expect(screen.getByText('Listing not found')).toBeTruthy();
    fireEvent.click(screen.getByText('Browse the feed'));
    expect(m.router.replace).toHaveBeenCalledWith('/(tabs)/feed');
  });

  it('with cashback off, Buy for real promises no coins and records no cashback click', async () => {
    const client = await import('@/src/api/client');
    m.listing = {
      isLoading: false,
      isError: false,
      data: {
        id: 'l1',
        title: 'Tee',
        category: 'tops',
        coinPrice: 40,
        realPrice: null,
        houseModelImageUrl: 'https://img.test/l1.webp',
        tags: [],
        variants: [{ id: 'v1', size: 'M', color: 'Blue', garmentImageUrl: '' }],
        affiliateLinks: [{ url: 'https://shop.test/tee', label: 'Shop', platform: 'other' }],
      },
    };
    renderScreen(<ListingDetailScreen />);

    expect(screen.queryByText(/cashback/i)).toBeNull();
    expect(screen.queryByText(/partner ₹/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText('Shop'));
    });
    expect(client.recordAffiliateClick).not.toHaveBeenCalled();
  });
});

describe('cart', () => {
  it('a failed load is not an empty haul', () => {
    m.cart = failed(new TypeError('Failed to fetch'));
    renderScreen(<CartScreen />);

    expect(screen.queryByText('Your haul is empty')).toBeNull();
    expect(screen.getByText('Couldn’t load your haul')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(m.cart.refetch).toHaveBeenCalled();
  });

  it('tells the user when removing a piece failed', () => {
    m.cart = {
      isLoading: false,
      isError: false,
      data: {
        items: [{ variantId: 'v1', title: 'Tee', size: 'M', color: 'Blue', quantity: 1, coinPriceSnapshot: 40, imageUrl: '' }],
        coinTotal: 40,
      },
    };
    m.remove.mutate.mockImplementation((_id: string, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new TypeError('Failed to fetch')),
    );
    renderScreen(<CartScreen />);

    fireEvent.click(screen.getByLabelText('Remove Tee'));
    expect(m.remove.mutate).toHaveBeenCalledWith('v1', expect.any(Object));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Couldn’t remove it',
      'Could not reach WORN. Check your connection and try again.',
    );
  });

  it('ignores a second remove while one is in flight', () => {
    m.remove.mutate.mockReset();
    m.remove.isPending = true;
    m.remove.variables = 'v1';
    renderScreen(<CartScreen />);

    fireEvent.click(screen.getByLabelText('Remove Tee'));
    expect(m.remove.mutate).not.toHaveBeenCalled();
    m.remove.isPending = false;
    m.remove.variables = undefined;
  });
});

describe('not-found screen', () => {
  it('is a WORN screen with a way back, not the Expo template', () => {
    m.router.canGoBack.mockReturnValue(false);
    renderScreen(<NotFoundScreen />);

    expect(screen.queryByText("This screen doesn't exist.")).toBeNull();
    expect(screen.getByText('Page not found')).toBeTruthy();
    fireEvent.click(screen.getByText('Back to WORN'));
    expect(m.router.replace).toHaveBeenCalledWith('/(tabs)/feed');
  });
});

describe('goBack', () => {
  it('goes back when there is history', () => {
    const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
    goBack(router);
    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
