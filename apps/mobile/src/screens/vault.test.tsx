import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClosetVaultScreen from '@/app/(closet)/vault';

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
vi.mock('expo-image-picker', () => ({}));
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

beforeEach(() => {
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
