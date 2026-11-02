import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const idle = vi.hoisted(() => () => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  isRefetching: false,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FEATURE_CLOSET: true,
}));

vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/src/lib/purchases/useEntitlements', () => ({
  usePremiumAccess: () => ({ allowed: true, checking: false }),
}));
vi.mock('@/src/components/PremiumGate', () => ({
  PremiumGate: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('@/src/components/EmiDontMissCards', () => ({ EmiDontMissCards: () => null }));
vi.mock('@/src/components/RepairSpendChip', () => ({ RepairSpendChip: () => null }));

// The queries are gated off (no FINANCIAL), so they sit idle rather than failing with a 403.
vi.mock('@/src/hooks/closet/useCloset', () => ({
  useAccountantLedger: idle,
  useAccountantSeasonRoi: idle,
  useAccountantSummary: idle,
  useBudgets: idle,
  useCreateBudget: () => ({ mutate: vi.fn(), isPending: false }),
  useExportAccountantCsv: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/src/hooks/closet/useConsent', () => ({
  useConsentGate: () => ({
    allowed: false,
    missingError: new ApiRequestError(403, 'Missing active consent for scope: FINANCIAL'),
  }),
}));

import ClosetAccountantScreen from '@/app/(closet)/accountant';

describe('Accountant without FINANCIAL consent', () => {
  it('still tells the user what to allow, though nothing was requested', () => {
    render(<ClosetAccountantScreen />);
    expect(screen.getByText(/Allow "Money in your Vault" in Privacy & consent first/)).toBeTruthy();
    expect(screen.queryByText('No spend yet')).toBeNull();
  });
});
