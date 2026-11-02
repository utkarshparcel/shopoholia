import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  fetchConsents: vi.fn(),
  addCredit: vi.fn(),
  focused: true,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useIsFocused: () => mocks.focused,
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
    mocks.focused = true;
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

  it('drops the stale "allow it first" error when the user comes back from consent', async () => {
    const view = render(<ClosetOnboardingScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText('Add a gift card'));
    fireEvent.change(screen.getByPlaceholderText('Merchant (e.g. Amazon)'), {
      target: { value: 'Amazon' },
    });
    fireEvent.change(screen.getByPlaceholderText(/^Balance/), { target: { value: '500' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save & see found money'));
    });
    const prompt = /Allow "Money in your Vault" first/;
    expect(screen.getByText(prompt)).toBeTruthy();

    // Off to consent (the tab stays mounted), then back with consent granted.
    mocks.focused = false;
    view.rerender(<ClosetOnboardingScreen />);
    expect(screen.getByText(prompt)).toBeTruthy();
    mocks.focused = true;
    view.rerender(<ClosetOnboardingScreen />);
    expect(screen.queryByText(prompt)).toBeNull();
    // The typed card is still there to save.
    expect(screen.getByPlaceholderText('Merchant (e.g. Amazon)')).toHaveValue('Amazon');
  });
});
