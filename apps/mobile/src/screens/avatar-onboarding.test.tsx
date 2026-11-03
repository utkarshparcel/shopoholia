import { act, fireEvent, render, screen } from '@testing-library/react';
import { ONBOARDING_COIN_GRANT } from '@worn/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  router: { back: vi.fn(), replace: vi.fn(), canGoBack: vi.fn(() => true) },
}));

vi.mock('expo-router', () => ({
  router: mocks.router,
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock('@/src/api/client', () => ({
  getAvatar: vi.fn(async () => ({ status: 'NONE', referencePreviewUrl: null })),
  uploadAvatar: vi.fn(),
}));

vi.mock('@/src/lib/devAuth', () => ({ ensureDevAuth: vi.fn() }));
vi.mock('@/src/lib/analytics', () => ({ trackEvent: vi.fn() }));

// A spent-down balance, which the screen used to show as the "welcome grant".
vi.mock('@/src/stores/session', () => ({
  useSessionStore: (sel: (s: { accessToken: string; coinBalance: number }) => unknown) =>
    sel({ accessToken: 'tok', coinBalance: 95 }),
}));

import AvatarOnboardingScreen from '@/app/(onboarding)/avatar';

async function renderScreen() {
  render(<AvatarOnboardingScreen />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AvatarOnboardingScreen', () => {
  beforeEach(() => {
    mocks.params = {};
    mocks.router.back.mockClear();
    mocks.router.replace.mockClear();
    mocks.router.canGoBack.mockReturnValue(true);
  });

  it('shows the real welcome grant to a new user, not their current balance', async () => {
    mocks.params = { welcome: '1' };
    await renderScreen();
    expect(screen.getByText(`Welcome grant: ${ONBOARDING_COIN_GRANT} WORN coins`)).toBeTruthy();
    expect(screen.queryByText(/95 WORN coins/)).toBeNull();
  });

  it('asks for the one photo the picker takes, not "1–3 photos"', async () => {
    await renderScreen();
    expect(screen.getByText('Upload a photo of yourself (full or upper body)')).toBeTruthy();
    expect(screen.queryByText(/1–3/)).toBeNull();
  });

  it('shows no grant to a returning user editing their avatar', async () => {
    await renderScreen();
    expect(screen.queryByText(/Welcome grant/)).toBeNull();
  });

  it('Skip goes home when there is no screen to go back to (straight from sign-in)', async () => {
    mocks.router.canGoBack.mockReturnValue(false);
    await renderScreen();
    fireEvent.click(screen.getByText('Skip for now'));
    expect(mocks.router.back).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/');
  });
});
