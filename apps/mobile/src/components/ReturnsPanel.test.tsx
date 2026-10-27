import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReturnsPanel } from './ReturnsPanel';

const { trackEvent, bookMutate, correctMutate } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  bookMutate: vi.fn(),
  correctMutate: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Share and Linking come from the react-native mock in vitest.setup.ts.

vi.mock('@/src/lib/analytics', () => ({
  trackEvent,
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (selector: (s: { accessToken: string | null }) => unknown) =>
      selector({ accessToken: 'test-token' }),
    { getState: () => ({ accessToken: 'test-token' }) },
  ),
}));

vi.mock('@/src/stores/closet', () => ({
  useClosetStore: (selector: (s: { markDeadlineSetup: () => void }) => unknown) =>
    selector({ markDeadlineSetup: vi.fn() }),
}));

vi.mock('@/src/components/ProgressivePermPrompt', () => ({
  ProgressivePermPrompt: () => null,
}));

vi.mock('@/src/lib/delightHaptics', () => ({
  delightHapticRefundLanded: vi.fn(async () => true),
}));

vi.mock('@/src/api/client', () => ({
  createReturnPoll: vi.fn(async () => ({
    id: 'poll1',
    shareText: 'Should I return this?',
  })),
}));

vi.mock('@/src/hooks/closet/useCloset', () => ({
  useReturns: () => ({
    data: {
      returns: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          userId: 'u1',
          purchaseId: null,
          purchaseItemId: null,
          windowDeadline: '2099-02-15T12:00:00.000Z',
          state: 'INITIATED',
          refundMinor: null,
          method: null,
          tracking: null,
          merchant: 'Ajio',
          itemTitle: 'Later deadline tee',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          userId: 'u1',
          purchaseId: null,
          purchaseItemId: null,
          windowDeadline: '2099-01-15T12:00:00.000Z',
          state: 'INITIATED',
          refundMinor: null,
          method: null,
          tracking: null,
          merchant: 'Myntra',
          itemTitle: 'Navy jacket',
          merchantReturnUrl: 'https://www.myntra.com/my/orders',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          userId: 'u1',
          purchaseId: null,
          purchaseItemId: null,
          windowDeadline: '2020-01-01T12:00:00.000Z',
          state: 'EXPIRED',
          refundMinor: null,
          method: null,
          tracking: null,
          merchant: 'Flipkart',
          itemTitle: 'Expired kurta',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  }),
  useRefundEtaBoard: () => ({
    data: {
      board: [
        {
          returnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          merchant: 'Myntra',
          itemTitle: 'Navy jacket',
          tracking: null,
          state: 'INITIATED',
          pipeline: [
            { id: 'INITIATED', label: 'Initiated', state: 'current' },
            { id: 'CONFIRMED', label: 'Confirmed', state: 'todo' },
            { id: 'REFUNDED', label: 'Refunded', state: 'todo' },
          ],
          etaAt: '2099-01-20T12:00:00.000Z',
          daysLeft: 5,
          refundMinor: null,
          ledgerCredited: false,
          ledgerAmountMinor: null,
          ledgerCreditedAt: null,
        },
        {
          returnId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          merchant: 'Amazon',
          itemTitle: 'Credited shoes',
          tracking: null,
          state: 'REFUNDED',
          pipeline: [
            { id: 'INITIATED', label: 'Initiated', state: 'done' },
            { id: 'CONFIRMED', label: 'Confirmed', state: 'done' },
            { id: 'REFUNDED', label: 'Refunded', state: 'current' },
          ],
          etaAt: null,
          daysLeft: null,
          refundMinor: 1999,
          ledgerCredited: true,
          ledgerAmountMinor: 1999,
          ledgerCreditedAt: '2026-01-05T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  }),
  useAccountantLedger: () => ({
    data: {
      entries: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          kind: 'LEDGER',
          description: 'REFUND return.refund',
          amountMinor: 2500,
          createdAt: '2026-01-05T00:00:00.000Z',
          refId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        },
      ],
    },
  }),
  useReturnDetail: () => ({
    data: {
      request: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: 'u1',
        purchaseId: null,
        purchaseItemId: null,
        windowDeadline: '2099-01-15T12:00:00.000Z',
        state: 'INITIATED',
        refundMinor: null,
        method: null,
        tracking: null,
        merchant: 'Myntra',
        itemTitle: 'Navy jacket',
        merchantReturnUrl: 'https://www.myntra.com/my/orders',
        orderedSize: 'M',
        preferredSize: null,
        pickupSlotAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      events: [],
    },
    isLoading: false,
  }),
  useSizeMap: () => ({
    data: {
      brands: [
        {
          brand: 'Myntra',
          sampleCount: 2,
          outcomes: { tooSmall: 2, tooBig: 0, keptOrOther: 0 },
          suggestedDelta: 1,
          history: [
            {
              returnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              brand: 'Myntra',
              merchant: 'Myntra',
              itemTitle: 'Navy jacket',
              category: 'top',
              orderedSize: 'M',
              preferredSize: 'L',
              reason: 'TOO_SMALL',
              returnedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    },
  }),
  useInitiateReturn: () => ({ mutate: vi.fn(), isPending: false }),
  useConfirmReturn: () => ({ mutate: vi.fn(), isPending: false }),
  useBookReturnPickup: () => ({ mutate: bookMutate, isPending: false }),
  useRescheduleReturnPickup: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelReturnPickup: () => ({ mutate: vi.fn(), isPending: false }),
  useSnoozeRefundChase: () => ({ mutate: vi.fn(), isPending: false }),
  useEscalateRefundChase: () => ({ mutate: vi.fn(), isPending: false }),
  useCorrectReturnWindow: () => ({ mutate: correctMutate, isPending: false }),
  useMarkReturnRefunded: () => ({ mutate: vi.fn(), isPending: false }),
  usePurchases: () => ({
    data: { purchases: [] },
    isLoading: false,
  }),
}));

describe('ReturnsPanel (W031–W036)', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    bookMutate.mockClear();
    correctMutate.mockClear();
  });

  it('lists soonest deadline first, collapses expired, live ETA + ledger', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ReturnsPanel showLedgerRefunds />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Navy jacket').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Later deadline tee')).toBeTruthy();
    const navy = screen.getAllByText('Navy jacket')[0]!;
    const later = screen.getByText('Later deadline tee');
    expect(
      navy.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.queryByText('Expired kurta')).toBeNull();
    expect(screen.getByText(/Expired \(1\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Expired \(1\)/i }));
    expect(screen.getByText('Expired kurta')).toBeTruthy();

    expect(screen.getByText('Refund ETA')).toBeTruthy();
    expect(screen.getAllByText('Initiated → Confirmed → Refunded').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ETA .*left/i)).toBeTruthy();
    expect(screen.getByText(/Landed in ledger/i)).toBeTruthy();

    expect(screen.getByText('Refund ledger')).toBeTruthy();
    expect(screen.getByText('REFUND return.refund')).toBeTruthy();
    expect(screen.getByTestId('ledger-refund-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee').textContent).toMatch(
      /in your ledger/,
    );
    // States read as words; no table names or enums.
    expect(screen.queryByText(/money_ledger/i)).toBeNull();
    expect(screen.queryByText('INITIATED')).toBeNull();
    expect(screen.getAllByText('Started').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('In ledger')).toBeTruthy();
  });

  it('checks the corrected window date and ends it on this phone\'s day', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Asia/Kolkata';
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ReturnsPanel />
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0]!);
      // A label key with no file behind it was saved as "Label saved": no such button now.
      expect(screen.queryByTestId('attach-return-label')).toBeNull();

      const date = screen.getByPlaceholderText(/Last day to return/);
      fireEvent.change(date, { target: { value: '2026-02-30' } });
      fireEvent.change(screen.getByPlaceholderText('Reason for correction'), {
        target: { value: 'Merchant email says 30 days' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save window' }));
      expect(screen.getByTestId('return-window-error').textContent).toMatch(/YYYY-MM-DD/);
      expect(correctMutate).not.toHaveBeenCalled();

      fireEvent.change(date, { target: { value: '2026-11-03' } });
      expect(screen.queryByTestId('return-window-error')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Save window' }));
      expect(correctMutate.mock.calls[0]![0]).toEqual({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        windowDeadline: '2026-11-03T18:29:59.000Z',
        reason: 'Merchant email says 30 days',
      });
    } finally {
      process.env.TZ = tz;
    }
  });

  it('shows merchant portal, pickup calendar, and dismissible size tip', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ReturnsPanel showLedgerRefunds />
      </QueryClientProvider>,
    );

    const views = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(views[0]!);

    expect(screen.getByTestId('portal-field-checklist')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Copy SKU/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Open merchant return portal/i }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Open merchant return portal/i }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      'return_portal_open',
      expect.objectContaining({
        returnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    );

    expect(screen.getByTestId('pickup-slot-cal')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Book pickup/i })).toBeTruthy();

    expect(screen.getByTestId('size-map-tip')).toBeTruthy();
    expect(screen.getByText(/Buy L next|runs small/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(trackEvent).toHaveBeenCalledWith(
      'size_map_tip_dismiss',
      expect.objectContaining({ brand: 'Myntra' }),
    );
    expect(screen.queryByTestId('size-map-tip')).toBeNull();
  });
});
