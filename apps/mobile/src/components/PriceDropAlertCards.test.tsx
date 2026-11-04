import { fireEvent, render, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { trackEvent } from '@/src/lib/analytics';

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

  it('S3-24: offers every dismiss reason inline (no Alert, which drops buttons on Android and web)', () => {
    render(<PriceDropAlertCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    for (const label of ['Still too expensive', 'Wrong size / fit', 'Already own it', 'Not interested', 'Other', 'Cancel']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Wrong size / fit' }));
    expect(trackEvent).toHaveBeenCalledWith('price_drop_card_dismiss', {
      listingId: hit.listingId,
      reason: 'WRONG_SIZE',
    });
    expect(screen.queryByTestId('price-drop-alert-cards')).toBeNull();
  });

  it('S3-24: Cancel closes the reasons and keeps the card', () => {
    render(<PriceDropAlertCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Other' })).toBeNull();
    expect(screen.getByTestId('price-drop-alert-cards')).toBeTruthy();
  });
});
