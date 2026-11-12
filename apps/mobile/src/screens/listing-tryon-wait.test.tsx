import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TryonResponse } from '@/src/api/client';

const m = vi.hoisted(() => ({
  tryon: { mutateAsync: vi.fn(), isPending: false, data: undefined as TryonResponse | undefined },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: false, FEATURE_CASHBACK: false }));
vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string }) => unknown) => sel({ accessToken: 'tok' }),
}));
vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/src/api/client', () => ({ recordAffiliateClick: vi.fn(async () => null) }));
vi.mock('@/src/hooks/catalog', () => ({
  useListing: () => ({
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
      affiliateLinks: [],
    },
  }),
  useAddToCart: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTryon: () => m.tryon,
}));

import ListingDetailScreen from '@/app/listing/[id]';

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ListingDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.tryon = { mutateAsync: vi.fn(), isPending: false, data: undefined };
});

describe('ListingDetailScreen, a try-on waiting for the render agent', () => {
  it('says when it will be ready instead of a spinner', () => {
    m.tryon.data = {
      status: 'PROCESSING',
      previewUrl: null,
      rendersWaiting: true,
      expectedReadyAt: '2026-11-05T01:30:00.000Z',
    };
    renderScreen();
    const note = screen.getByTestId('listing-tryon-wait');
    expect(note.textContent).toMatch(/^Your try-on is being styled .*ready by about .+\. Tap Try on me again to see it\.$/);
    expect(screen.queryByText('Styling your look…')).toBeNull();
  });

  it('says shortly with no time (the agent is down)', () => {
    m.tryon.data = { status: 'PROCESSING', previewUrl: null, rendersWaiting: true, expectedReadyAt: null };
    renderScreen();
    expect(screen.getByTestId('listing-tryon-wait').textContent).toBe(
      'Your try-on is being styled and will be ready shortly. Tap Try on me again to see it.',
    );
  });

  it('keeps the spinner, and no note, while a preview is rendering now', () => {
    m.tryon.data = { status: 'PROCESSING', previewUrl: null, rendersWaiting: false, expectedReadyAt: null };
    renderScreen();
    expect(screen.queryByTestId('listing-tryon-wait')).toBeNull();
    expect(screen.getByText('Styling your look…')).toBeTruthy();
  });
});
