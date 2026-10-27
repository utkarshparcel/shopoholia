import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceDropAlertCards } from './PriceDropAlertCards';

const hit = {
  watchId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  listingId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  brand: 'Zara',
  listingTitle: 'Linen Shirt',
  watchedPriceMinor: 200_000,
  currentPriceMinor: 160_000,
  dropPct: 20,
  thresholdPct: 10,
  notified: false,
};

vi.mock('@/src/hooks/closet/useCloset', () => ({
  usePriceDropScan: vi.fn(() => ({
    data: { hits: [hit], scannedListings: 1 },
  })),
  useCreatePriceWatch: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('PriceDropAlertCards (U008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders watch / buy / dismiss actions', () => {
    render(<PriceDropAlertCards />);
    expect(screen.getByTestId('price-drop-alert-cards')).toBeTruthy();
    expect(screen.getByText(/Zara dropped/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('hides when disabled', () => {
    render(<PriceDropAlertCards enabled={false} />);
    expect(screen.queryByTestId('price-drop-alert-cards')).toBeNull();
  });
});
