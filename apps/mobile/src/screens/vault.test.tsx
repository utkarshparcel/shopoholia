import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClosetVaultScreen from '@/app/(closet)/vault';
import { addCredit } from '@/src/api/client';
import { enqueueVaultAdd, VAULT_ADD_QUEUE_KEY } from '@/src/lib/vaultAddQueue';
import { useSessionStore } from '@/src/stores/session';

let queryClient: QueryClient;
function render(ui: ReactElement) {
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const ACCOUNT = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => {
  type Mutation = { mutate: ReturnType<typeof vi.fn>; mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
  const mutations = new Map<string, Mutation>();
  const queries = new Map<string, unknown>();
  const mutation = (name: string): Mutation => {
    let m = mutations.get(name);
    if (!m) {
      m = { mutate: vi.fn(), mutateAsync: vi.fn(async () => ({})), isPending: false };
      mutations.set(name, m);
    }
    return m;
  };
  const query = (name: string) => ({
    data: queries.get(name),
    isLoading: false,
    isError: false,
    isFetching: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  });
  return { mutations, queries, mutation, query };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('@/src/api/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  addCredit: vi.fn(async () => ({ id: 'server-card' })),
}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('@/src/lib/receiptSnap', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pickReceiptSnapImage: vi.fn(async () => ({ uri: 'file:///receipt.jpg' })),
}));
vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FEATURE_CLOSET: true,
}));
vi.mock('@/src/hooks/closet/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOffline: false }) }));
vi.mock('@/src/hooks/closet/keys', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSessionUserId: () => 'user-1',
}));
vi.mock('@/src/hooks/closet/useConsent', () => ({
  useConsentGate: () => ({ allowed: true, missingError: null }),
}));
const reminder = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock('@/src/lib/balanceReminder', () => ({ scheduleBalanceRecheckReminder: reminder.schedule }));
// Panels on other tabs and decorative components are not under test here.
vi.mock('@/src/components/ReturnsPanel', () => ({ ReturnsPanel: () => null }));
vi.mock('@/src/components/PackagesPanel', () => ({ PackagesPanel: () => null }));
vi.mock('@/src/components/CashbackClaimsPanel', () => ({ CashbackClaimsPanel: () => null }));
vi.mock('@/src/components/VaultPrivacyActions', () => ({ VaultPrivacyActions: () => null }));
vi.mock('@/src/components/VaultTrustStrip', () => ({ VaultTrustStrip: () => null }));
vi.mock('@/src/components/PriceDropAlertCards', () => ({ PriceDropAlertCards: () => null }));
vi.mock('@/src/components/EmiDontMissCards', () => ({ EmiDontMissCards: () => null }));
vi.mock('@/src/components/FoundMoneyCountUp', () => ({ FoundMoneyCountUp: () => null }));
vi.mock('@/src/components/ExpiryCountdownHero', () => ({ ExpiryCountdownHero: () => null }));
vi.mock('@/src/components/MultiCardStack', () => ({ MultiCardStack: () => null }));

vi.mock('@/src/hooks/closet/useCloset', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(actual)) {
    if (!name.startsWith('use')) {
      out[name] = actual[name];
      continue;
    }
    out[name] = () => ({ ...h.query(name), ...h.mutation(name) });
  }
  return out;
});

function giftCard(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT,
    kind: 'GIFT_CARD',
    merchant: 'Myntra',
    currency: 'INR',
    balanceCacheMinor: 120000,
    expiresAt: null,
    status: 'ACTIVE',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await AsyncStorage.removeItem(VAULT_ADD_QUEUE_KEY);
  useSessionStore.setState({ accessToken: null });
  h.mutations.clear();
  h.queries.clear();
  h.queries.set('useGiftCards', { accounts: [giftCard()] });
});

describe('vault gift-card spend (S1-19)', () => {
  it('does not send a second spend while the first is in flight', async () => {
    render(<ClosetVaultScreen />);
    fireEvent.click(screen.getAllByText('Mark spent')[0]!);
    fireEvent.change(screen.getByPlaceholderText('Amount spent in INR'), { target: { value: '100' } });
    const spend = h.mutation('useSpendGiftCard');
    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });
    expect(spend.mutate).toHaveBeenCalledTimes(1);
    expect(spend.mutate.mock.calls[0]![0]).toEqual({ id: ACCOUNT, amountMinor: 10000 });

    // The first request is still running: a second tap must not spend again.
    spend.isPending = true;
    fireEvent.change(screen.getByPlaceholderText('Amount spent in INR'), { target: { value: '100.0' } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Confirm'));
    });
    expect(spend.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('vault balance re-check reminder (S1-25)', () => {
  beforeEach(() => {
    reminder.schedule.mockReset();
    vi.mocked(Alert.alert).mockReset();
    h.queries.set('useGiftCards', {
      accounts: [giftCard({ balanceCheck: { due: true, checkUrl: null } })],
    });
  });

  it('schedules a reminder before saying it is set', async () => {
    reminder.schedule.mockResolvedValue({ scheduled: true, at: new Date(2026, 10, 10, 10) });
    render(<ClosetVaultScreen />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remind me later'));
    });
    expect(reminder.schedule).toHaveBeenCalledWith(expect.objectContaining({ id: ACCOUNT, merchant: 'Myntra' }));
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe('Reminder set');
  });

  it('does not claim a reminder when notifications are off', async () => {
    reminder.schedule.mockResolvedValue({ scheduled: false, reason: 'permission' });
    render(<ClosetVaultScreen />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remind me later'));
    });
    expect(vi.mocked(Alert.alert).mock.calls[0]![0]).toBe('Reminder not set');
  });
});

describe('vault offline add queue (S1-26)', () => {
  beforeEach(() => {
    vi.mocked(addCredit).mockClear();
  });

  it('refetches the gift-card list once queued cards sync, and drops the pending row', async () => {
    await enqueueVaultAdd('user-1', { kind: 'GIFT_CARD', merchant: 'Nykaa', currency: 'INR', balanceMinor: 50000 });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    useSessionStore.setState({ accessToken: 'tok' });
    render(<ClosetVaultScreen />);
    await waitFor(() => expect(addCredit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])).toContain('gift-cards'),
    );
    await waitFor(() => expect(screen.queryByText('Nykaa (pending sync)')).toBeNull());
  });

  it('offers no spend or re-check on a card that has not synced (its id is not on the server)', async () => {
    await enqueueVaultAdd('user-1', { kind: 'GIFT_CARD', merchant: 'Nykaa', currency: 'INR', balanceMinor: 50000 });
    h.queries.set('useGiftCards', { accounts: [] });
    render(<ClosetVaultScreen />);
    await screen.findByText('Nykaa (pending sync)');
    expect(screen.queryByText('Mark spent')).toBeNull();
    expect(screen.queryByText('Re-check')).toBeNull();
  });
});

describe('vault receipt review currency (S1-27)', () => {
  it('confirms in the currency the user picks, not always the parsed one', async () => {
    render(<ClosetVaultScreen />);
    fireEvent.click(screen.getByLabelText('Receipts'));
    const upload = h.mutation('useUploadReceipt');
    upload.mutate.mockImplementation((_uri: string, opts: { onSuccess: (p: unknown) => void }) =>
      opts.onSuccess({
        id: '44444444-4444-4444-8444-444444444444',
        merchant: 'Target',
        purchasedAt: '2026-11-01T12:00:00.000Z',
        totalMinor: 2599,
        currency: 'INR',
        items: [{ title: 'Tee', priceMinor: 2599 }],
        confidence: 0.95,
        warrantyHint: null,
        claimContactHint: null,
        purchaseId: null,
        imageUrl: 'https://img',
        ocrJson: {},
        userId: 'user-1',
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Snap a receipt'));
    });
    await screen.findByText('Review receipt');
    fireEvent.click(screen.getByLabelText('USD'));
    expect(screen.getByPlaceholderText('Total in USD')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Save receipt'));
    });
    const confirm = h.mutation('useConfirmReceipt');
    expect(confirm.mutate).toHaveBeenCalledTimes(1);
    const body = (confirm.mutate.mock.calls[0]![0] as { body: { currency: string; totalMinor: number } }).body;
    expect(body.currency).toBe('USD');
    expect(body.totalMinor).toBe(2599);
  });
});
