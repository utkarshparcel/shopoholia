import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  fetchConsents: vi.fn(),
  addCredit: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
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
  addCredit: mocks.addCredit,
  fetchConsents: mocks.fetchConsents,
  fetchCredits: vi.fn(async () => ({ accounts: [] })),
  fetchWardrobe: vi.fn(async () => ({ items: [] })),
}));

vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));

import ClosetOnboardingScreen from '@/app/(closet)/onboarding';
import { useClosetStore } from '@/src/stores/closet';

async function renderReady() {
  render(<ClosetOnboardingScreen />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Closet onboarding gift card → consent', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.addCredit.mockReset();
    mocks.fetchConsents.mockReset();
    mocks.fetchConsents.mockResolvedValue({ grants: [] });
    useClosetStore.getState().clear();
  });

  it('sends the user to consent with a way back here, keeping the typed card', async () => {
    await renderReady();
    fireEvent.click(screen.getByText('Add a gift card'));
    fireEvent.change(screen.getByPlaceholderText('Merchant (e.g. Amazon)'), {
      target: { value: 'Amazon' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^Balance/), { target: { value: '500' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save & see found money'));
    });
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/(closet)/consent',
      params: { returnTo: '/(closet)/onboarding' },
    });
    expect(useClosetStore.getState().giftCardDraft).toEqual({ merchant: 'Amazon', balance: '500' });
  });

  it('comes back from consent on the gift-card step with the card filled in', async () => {
    useClosetStore.getState().setGiftCardDraft({ merchant: 'Amazon', balance: '500' });
    await renderReady();
    expect(screen.getByPlaceholderText('Merchant (e.g. Amazon)')).toHaveValue('Amazon');
    expect(screen.getByPlaceholderText(/^Balance/)).toHaveValue('500');

    mocks.fetchConsents.mockResolvedValue({ grants: [{ scope: 'FINANCIAL' }] });
    mocks.addCredit.mockResolvedValue({});
    await act(async () => {
      fireEvent.click(screen.getByText('Save & see found money'));
    });
    expect(mocks.addCredit).toHaveBeenCalledTimes(1);
    expect(useClosetStore.getState().giftCardDraft).toBeNull();
  });
});
