import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { missingConsentScope } from '@/src/lib/closetScreenState';

const mocks = vi.hoisted(() => ({
  fetchConsents: vi.fn(),
  fetchCredits: vi.fn(async () => ({ accounts: [] })),
  fetchAccountantSummary: vi.fn(async () => ({})),
  fetchEmiPlans: vi.fn(async () => ({ plans: [] })),
}));

const sessionState = vi.hoisted(() => ({ accessToken: 'test-token' as string | null }));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: Object.assign(
    (selector: (s: typeof sessionState) => unknown) => selector(sessionState),
    { getState: () => sessionState },
  ),
}));

vi.mock('@/src/lib/access-token', () => ({
  userIdFromAccessToken: (token: string | null) => (token ? 'user-1' : null),
}));

vi.mock('@/src/api/client', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    code: string | null;
    constructor(status: number, message: string, code: string | null = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  fetchConsents: mocks.fetchConsents,
  fetchCredits: mocks.fetchCredits,
  fetchAccountantSummary: mocks.fetchAccountantSummary,
  fetchEmiPlans: mocks.fetchEmiPlans,
}));

import { useAccountantSummary, useEmiPlans, useGiftCards } from './useCloset';
import { useConsentGate } from './useConsent';

function grants(...scopes: string[]) {
  return {
    grants: scopes.map((scope) => ({
      id: scope,
      userId: 'user-1',
      scope,
      grantedAt: '2026-01-01T00:00:00.000Z',
      revokedAt: null,
      source: 'consent-center',
      meta: null,
    })),
  };
}

function Probe() {
  const gate = useConsentGate('FINANCIAL');
  const gifts = useGiftCards();
  useAccountantSummary();
  useEmiPlans();
  return (
    <span>
      {gate.allowed ? 'allowed' : 'gated'} {gate.missingError ? 'missing' : 'ok'}{' '}
      {gifts.data ? 'cards' : 'none'}
    </span>
  );
}

let lastGate: ReturnType<typeof useConsentGate> | null = null;
function GateProbe() {
  lastGate = useConsentGate('FINANCIAL');
  return null;
}

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('useConsentGate', () => {
  beforeEach(() => {
    sessionState.accessToken = 'test-token';
    mocks.fetchConsents.mockReset();
    mocks.fetchCredits.mockClear();
    mocks.fetchAccountantSummary.mockClear();
    mocks.fetchEmiPlans.mockClear();
    lastGate = null;
  });

  it('keeps FINANCIAL queries from firing (and 403ing) until FINANCIAL is granted', async () => {
    mocks.fetchConsents.mockResolvedValue(grants('EMAIL'));
    renderWith(<Probe />);
    await waitFor(() => expect(screen.getByText(/gated missing/)).toBeTruthy());
    expect(mocks.fetchCredits).not.toHaveBeenCalled();
    expect(mocks.fetchAccountantSummary).not.toHaveBeenCalled();
    expect(mocks.fetchEmiPlans).not.toHaveBeenCalled();
  });

  it('runs them once FINANCIAL is granted', async () => {
    mocks.fetchConsents.mockResolvedValue(grants('FINANCIAL'));
    renderWith(<Probe />);
    await waitFor(() => expect(screen.getByText(/allowed ok cards/)).toBeTruthy());
    expect(mocks.fetchCredits).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAccountantSummary).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEmiPlans).toHaveBeenCalledTimes(1);
  });

  it('waits while the grants load, then lets the server decide if they cannot be read', async () => {
    let fail: (e: Error) => void = () => {};
    mocks.fetchConsents.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    renderWith(<Probe />);
    expect(screen.getByText(/gated ok/)).toBeTruthy();
    fail(new Error('offline'));
    await waitFor(() => expect(mocks.fetchCredits).toHaveBeenCalledTimes(1));
  });

  it('treats a revoked grant as missing, with the API’s own refusal for the screen', async () => {
    const revoked = grants('FINANCIAL');
    revoked.grants[0].revokedAt = '2026-02-01T00:00:00.000Z' as never;
    mocks.fetchConsents.mockResolvedValue(revoked);
    renderWith(<GateProbe />);
    await waitFor(() => expect(lastGate?.missingError).toBeTruthy());
    expect(lastGate?.allowed).toBe(false);
    expect(missingConsentScope(lastGate?.missingError)).toBe('FINANCIAL');
  });
});
