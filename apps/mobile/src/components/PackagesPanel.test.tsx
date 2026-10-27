import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PackagesPanel } from './PackagesPanel';

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/src/api/client', () => ({
  fetchPackages: vi.fn(async () => ({
    packages: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        merchant: 'Myntra',
        orderRef: 'ORD-1',
        purchasedAt: '2026-08-20T00:00:00.000Z',
        currency: 'INR',
        totalMinor: 199900,
        deliveryStatus: 'IN_TRANSIT',
        etaAt: '2026-08-28T00:00:00.000Z',
        trackingCode: 'AWB123',
        deliveredAt: null,
        returnWindowDeadline: null,
        exchangeWindowDeadline: null,
        itemTitles: ['Navy jacket'],
      },
    ],
  })),
  fetchExchanges: vi.fn(async () => ({
    exchanges: [
      {
        purchaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        merchant: 'Amazon',
        orderRef: null,
        purchasedAt: '2026-08-01T00:00:00.000Z',
        returnWindowDeadline: '2026-08-31T00:00:00.000Z',
        exchangeWindowDeadline: '2026-08-15T00:00:00.000Z',
        windowsDiffer: true,
        daysLeftExchange: 2,
        daysLeftReturn: 10,
        itemTitles: ['Tee'],
      },
    ],
  })),
  fetchRtoRecovery: vi.fn(async () => ({
    board: [
      {
        purchaseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        merchant: 'Flipkart',
        orderRef: 'FK-9',
        totalMinor: 99900,
        currency: 'INR',
        deliveryStatus: 'FAILED',
        trackingCode: null,
        failedAt: '2026-08-25T00:00:00.000Z',
        checklist: [
          { id: 'CONTACT_MERCHANT', label: 'Contact merchant / courier', state: 'current' },
          { id: 'OPEN_REFUND', label: 'Open refund claim', state: 'todo' },
          { id: 'TRACK_REFUND', label: 'Track refund to ledger', state: 'todo' },
          { id: 'CANCEL_OR_RESHIP', label: 'Cancel order or accept reship', state: 'todo' },
        ],
        returnId: null,
        refundTrack: null,
      },
      {
        purchaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        merchant: 'Ajio',
        orderRef: null,
        totalMinor: 50000,
        currency: 'INR',
        deliveryStatus: 'FAILED',
        trackingCode: null,
        failedAt: '2026-08-24T00:00:00.000Z',
        checklist: [
          { id: 'CONTACT_MERCHANT', label: 'Contact merchant / courier', state: 'done' },
          { id: 'OPEN_REFUND', label: 'Open refund claim', state: 'current' },
          { id: 'TRACK_REFUND', label: 'Track refund to ledger', state: 'todo' },
          { id: 'CANCEL_OR_RESHIP', label: 'Cancel order or accept reship', state: 'todo' },
        ],
        returnId: null,
        refundTrack: null,
      },
    ],
  })),
  markPackageDelivered: vi.fn(),
  startRtoRefund: vi.fn(),
  createReturn: vi.fn(),
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PackagesPanel />
    </QueryClientProvider>,
  );
}

describe('PackagesPanel (W037–W039)', () => {
  it('shows RTO checklist and start-refund CTA', async () => {
    renderPanel();
    expect(await screen.findByText('Failed delivery (RTO)')).toBeTruthy();
    expect(await screen.findAllByText('Open refund claim')).toHaveLength(2);
    expect(await screen.findByText('Start refund')).toBeTruthy();
  });

  it('shows delivery timeline steps and ETA', async () => {
    renderPanel();
    expect(await screen.findByText('Mark delivered · add to wardrobe')).toBeTruthy();
    expect(screen.getAllByText('In transit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Out for delivery')).toBeTruthy();
    expect(screen.getByText(/ETA/)).toBeTruthy();
  });

  it('shows dual CTAs when windowsDiffer', async () => {
    renderPanel();
    expect(await screen.findByText('Start exchange')).toBeTruthy();
    expect(await screen.findByText('Start return')).toBeTruthy();
  });
});
