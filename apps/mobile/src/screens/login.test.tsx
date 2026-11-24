import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  return {
    replace: vi.fn(),
    googleResponse: null as null | { type: 'success'; params: { id_token: string } },
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    appleAvailable: true,
    appleSignInAsync: vi.fn(),
    digest: vi.fn(async (_alg: string, value: string) => `sha256(${value})`),
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

vi.mock('expo-apple-authentication', () => ({
  isAvailableAsync: vi.fn(async () => mocks.appleAvailable),
  signInAsync: mocks.appleSignInAsync,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
    <button onClick={onPress} type="button">
      Continue with Apple
    </button>
  ),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: mocks.digest,
  randomUUID: () => '11111111-2222-4333-8444-555555555555',
}));

vi.mock('@/src/api/client', () => ({
  signInWithGoogle: mocks.signInWithGoogle,
  signInWithApple: mocks.signInWithApple,
  sendOtp: mocks.sendOtp,
  verifyOtp: mocks.verifyOtp,
}));

import { Linking } from 'react-native';

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
    mocks.signInWithApple.mockReset();
    mocks.appleSignInAsync.mockReset();
    mocks.appleAvailable = true;
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
    expect(mocks.replace).toHaveBeenCalledWith('/(onboarding)/avatar?welcome=1');
    expect(mocks.replace).not.toHaveBeenCalledWith('/');
    expect(lastRoute()).toBe('/(onboarding)/avatar?welcome=1');
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
    expect(lastRoute()).toBe('/(onboarding)/avatar?welcome=1');
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

describe('LoginScreen: Sign in with Apple (App Store 4.8)', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
    mocks.replace.mockClear();
    mocks.googleResponse = null;
    mocks.signInWithApple.mockReset();
    mocks.appleSignInAsync.mockReset();
    mocks.appleAvailable = true;
  });

  it('offers Apple next to Google on iOS', async () => {
    render(<LoginScreen />);
    expect(await screen.findByRole('button', { name: 'Continue with Apple' })).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
  });

  it('hides the Apple button where Apple sign-in is not available', async () => {
    mocks.appleAvailable = false;
    render(<LoginScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });

  it('gives Apple the hashed nonce, sends the server the raw one, the name and the code, and signs in', async () => {
    mocks.appleSignInAsync.mockResolvedValue({
      identityToken: 'apple-identity-token',
      authorizationCode: 'apple-authorization-code',
      fullName: { givenName: 'Asha', familyName: 'Rao' },
      email: null,
    });
    mocks.signInWithApple.mockResolvedValue({ accessToken: 'ap', refreshToken: 'r', isNewUser: true });
    render(<LoginScreen />);
    const button = await screen.findByRole('button', { name: 'Continue with Apple' });
    await act(async () => {
      fireEvent.click(button);
    });
    const rawNonce = '11111111222243338444555555555555'.repeat(2);
    expect(mocks.appleSignInAsync).toHaveBeenCalledWith({
      requestedScopes: [0, 1],
      nonce: `sha256(${rawNonce})`,
    });
    expect(mocks.signInWithApple).toHaveBeenCalledWith({
      identityToken: 'apple-identity-token',
      nonce: rawNonce,
      fullName: 'Asha Rao',
      authorizationCode: 'apple-authorization-code',
    });
    expect(useSessionStore.getState().accessToken).toBe('ap');
    expect(lastRoute()).toBe('/(onboarding)/avatar?welcome=1');
  });

  it('does nothing when the user cancels the Apple sheet', async () => {
    mocks.appleSignInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    render(<LoginScreen />);
    const button = await screen.findByRole('button', { name: 'Continue with Apple' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.signInWithApple).not.toHaveBeenCalled();
    expect(screen.queryByText('canceled')).toBeNull();
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('shows the server error when the sign-in is refused', async () => {
    mocks.appleSignInAsync.mockResolvedValue({ identityToken: 't', fullName: null, email: null });
    mocks.signInWithApple.mockRejectedValue(new Error('Invalid Apple identity token'));
    render(<LoginScreen />);
    const button = await screen.findByRole('button', { name: 'Continue with Apple' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByText('Invalid Apple identity token')).toBeTruthy();
    expect(useSessionStore.getState().accessToken).toBeNull();
    // No authorization code from Apple: the request says so instead of leaving it out silently.
    expect(mocks.signInWithApple).toHaveBeenCalledWith(expect.objectContaining({ authorizationCode: null }));
  });
});

describe('LoginScreen: privacy policy', () => {
  it('links the privacy policy before sign-in', async () => {
    render(<LoginScreen />);
    fireEvent.click(screen.getByText('Privacy policy'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://worncloset.app/privacy');
  });
});
