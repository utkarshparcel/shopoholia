import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { signInWithApple as postAppleSignIn } from '@/src/api/client';

/**
 * Sign in with Apple (App Store Guideline 4.8: offered next to Google on iOS). The app makes a raw
 * nonce per sign-in and gives Apple its SHA-256; Apple puts that in the identity token, and the
 * server checks it against the raw nonce (POST /auth/apple).
 */

export type AppleSignInResult =
  | { status: 'signed-in'; tokens: Awaited<ReturnType<typeof postAppleSignIn>> }
  | { status: 'cancelled' };

/** Only on iOS devices that support it (iOS 13+); never on Android or the web. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function fullNameOf(name: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  if (!name) return null;
  const joined = [name.givenName, name.familyName].filter(Boolean).join(' ').trim();
  return joined || null;
}

function isCancel(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
  );
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  const nonce = `${randomUUID()}${randomUUID()}`.replaceAll('-', '');
  const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isCancel(error)) return { status: 'cancelled' };
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token. Try again.');
  const tokens = await postAppleSignIn({
    identityToken: credential.identityToken,
    nonce,
    fullName: fullNameOf(credential.fullName),
  });
  return { status: 'signed-in', tokens };
}
