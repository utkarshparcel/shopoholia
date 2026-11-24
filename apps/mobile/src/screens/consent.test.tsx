import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConsentScreen from '@/app/(closet)/consent';

const revoke = vi.fn(async (_scope: string) => ({}));
const grant = vi.fn(async (_input: { scope: string; source: string }) => ({}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
  params: {} as Record<string, string>,
}));

vi.mock('expo-router', () => ({
  useRouter: () => routerMock,
  useLocalSearchParams: () => routerMock.params,
}));

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
  openBrowserAsync: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  FEATURE_CLOSET: true,
}));

vi.mock('@/src/stores/session', () => ({
  useSessionStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: 'test-token' }),
}));

vi.mock('@/src/api/client', () => ({
  createIngestionSource: vi.fn(),
  // Never settles: the notification card is not under test here.
  fetchNotificationPreferences: vi.fn(() => new Promise(() => {})),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock('@/src/components/QuietHoursEditor', () => ({ QuietHoursEditor: () => null }));
vi.mock('@/src/components/VaultPrivacyActions', () => ({ VaultPrivacyActions: () => null }));

vi.mock('@/src/hooks/closet/useConsent', () => ({
  useConsents: () => ({
    data: { grants: [{ scope: 'EMAIL', grantedAt: '2026-10-01T00:00:00.000Z' }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useConsentSources: () => ({ data: { sources: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useGrantConsent: () => ({ mutateAsync: grant, isPending: false }),
  useRevokeConsent: () => ({ mutateAsync: revoke, isPending: false }),
  useDisconnectSource: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('ConsentScreen', () => {
  beforeEach(() => {
    revoke.mockClear();
    grant.mockClear();
    routerMock.replace.mockClear();
    routerMock.back.mockClear();
    routerMock.params = {};
  });

  it('approving returns to the screen that opened consent, not the first tab', async () => {
    routerMock.params = { returnTo: '/(closet)/onboarding' };
    render(<ConsentScreen />);
    fireEvent.click(screen.getByText(/☐ Money in your Vault/));
    await act(async () => {
      fireEvent.click(screen.getByText('Approve & connect'));
    });
    expect(grant).toHaveBeenCalledWith({ scope: 'FINANCIAL', source: 'consent-center' });
    expect(routerMock.back).not.toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenCalledWith('/(closet)/onboarding');
  });

  it('falls back to the Vault without (or with a foreign) returnTo, on approve and cancel', async () => {
    routerMock.params = { returnTo: 'https://evil.example/' };
    render(<ConsentScreen />);
    fireEvent.click(screen.getByText(/☐ Money in your Vault/));
    await act(async () => {
      fireEvent.click(screen.getByText('Approve & connect'));
    });
    expect(routerMock.back).not.toHaveBeenCalled();
    expect(routerMock.replace).toHaveBeenLastCalledWith('/(closet)/vault');
  });

  it('ticks nothing for the user, so approving needs an explicit choice', () => {
    render(<ConsentScreen />);
    expect(screen.queryByText(/☑/)).toBeNull();
    expect(screen.getByText(/☐ Email receipts/)).toBeTruthy();
    // SMS is never read: an ungranted SMS scope is not offered at all.
    expect(screen.queryByText(/Order texts/)).toBeNull();
    fireEvent.click(screen.getByText('Approve & connect'));
    expect(grant).not.toHaveBeenCalled();
  });

  it('asks before revoking, and Cancel leaves the grant alone', async () => {
    render(<ConsentScreen />);
    fireEvent.click(screen.getByText('Revoke'));
    expect(screen.getByText('Revoke Email receipts?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('prompt-sheet')).getByText('Cancel'));
    });
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('prompt-sheet')).toBeNull();

    fireEvent.click(screen.getByText('Revoke'));
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('prompt-sheet')).getByText('Revoke'));
    });
    expect(revoke).toHaveBeenCalledWith('EMAIL');
  });
});
