import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  return {
    replace: vi.fn(),
    googleResponse: null as null | { type: 'success'; params: { id_token: string } },
    signInWithGoogle: vi.fn(),
    sendOtp: vi.fn(async () => undefined),
    verifyOtp: vi.fn(),
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), back: vi.fn() }),
}));

vi.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: vi.fn() }));

vi.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{}, mocks.googleResponse, vi.fn(async () => undefined)],
}));

vi.mock('@/src/api/client', () => ({
  signInWithGoogle: mocks.signInWithGoogle,
  sendOtp: mocks.sendOtp,
  verifyOtp: mocks.verifyOtp,
}));

import LoginScreen from '@/app/(auth)/login';
import { useSessionStore } from '@/src/stores/session';

function lastRoute() {
  return mocks.replace.mock.calls.at(-1)?.[0];
}

describe('LoginScreen routing', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
    mocks.replace.mockClear();
    mocks.googleResponse = null;
    mocks.signInWithGoogle.mockReset();
    mocks.verifyOtp.mockReset();
  });

  it('sends a brand-new user (dev continue) to avatar onboarding, not the entry route', async () => {
    mocks.verifyOtp.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      isNewUser: true,
      coinBalance: 100,
    });
    render(<LoginScreen />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dev continue' }));
    });
    expect(useSessionStore.getState().accessToken).toBe('a');
    expect(mocks.replace).toHaveBeenCalledWith('/(onboarding)/avatar');
    expect(mocks.replace).not.toHaveBeenCalledWith('/');
    expect(lastRoute()).toBe('/(onboarding)/avatar');
  });

  it('sends a returning user (dev continue) to the entry route', async () => {
    mocks.verifyOtp.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', isNewUser: false });
    render(<LoginScreen />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dev continue' }));
    });
    expect(lastRoute()).toBe('/');
  });

  it('sends a brand-new Google user to avatar onboarding and signs in only once', async () => {
    mocks.googleResponse = { type: 'success', params: { id_token: 'id' } };
    mocks.signInWithGoogle.mockResolvedValue({
      accessToken: 'g',
      refreshToken: 'r',
      isNewUser: true,
    });
    render(<LoginScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(useSessionStore.getState().accessToken).toBe('g');
    expect(lastRoute()).toBe('/(onboarding)/avatar');
    expect(mocks.replace).not.toHaveBeenCalledWith('/');
    expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('sends a session that was already there when the screen opened to the entry route', () => {
    useSessionStore.getState().setSession({ accessToken: 'a', refreshToken: 'r' });
    render(<LoginScreen />);
    expect(lastRoute()).toBe('/');
  });

  it('sends a session that arrives from elsewhere (restore / dev auth) to the entry route', () => {
    render(<LoginScreen />);
    expect(mocks.replace).not.toHaveBeenCalled();
    act(() => {
      useSessionStore.getState().setSession({ accessToken: 'a', refreshToken: 'r' });
    });
    expect(lastRoute()).toBe('/');
  });
});
