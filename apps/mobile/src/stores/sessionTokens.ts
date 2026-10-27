import type * as ExpoSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { captureException } from '@/src/lib/sentry';

/**
 * The one place the signed-in session is kept between launches.
 *
 * - iOS and Android: the Keychain / Keystore, through expo-secure-store. Never AsyncStorage,
 *   which is a plain file anyone with the device backup can read.
 * - Web has no secure store, so tokens stay in memory only: reloading the page signs you out.
 */
export const SESSION_TOKENS_PERSISTED = Platform.OS !== 'web';

export const SESSION_TOKENS_KEY = 'worn.session.v1';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  phone: string | null;
  email: string | null;
};

type SecureStore = typeof ExpoSecureStore;

let secureStore: Promise<SecureStore> | null = null;

// Loaded on first use, so screens and tests that never sign in don't load the native module.
function loadSecureStore(): Promise<SecureStore> {
  secureStore ??= import('expo-secure-store');
  return secureStore;
}

function options(store: SecureStore) {
  // Readable after the first unlock, so a background refresh after a reboot still works.
  return { keychainAccessible: store.AFTER_FIRST_UNLOCK };
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** A stored session, or null when the value isn't one (another version's format, or damage). */
export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const s = value as Partial<StoredSession> | null;
  if (
    !s ||
    typeof s.accessToken !== 'string' ||
    !s.accessToken ||
    typeof s.refreshToken !== 'string' ||
    !s.refreshToken ||
    !nullableString(s.phone ?? null) ||
    !nullableString(s.email ?? null)
  ) {
    return null;
  }
  return {
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    phone: s.phone ?? null,
    email: s.email ?? null,
  };
}

/** The last value read or written, so an unchanged session isn't written again. */
let lastSaved: string | null = null;

export async function readStoredSession(): Promise<StoredSession | null> {
  if (!SESSION_TOKENS_PERSISTED) return null;
  const store = await loadSecureStore();
  const raw = await store.getItemAsync(SESSION_TOKENS_KEY, options(store));
  const session = parseStoredSession(raw);
  if (raw && !session) {
    // Unreadable: drop it, so the user signs in again instead of failing on every launch.
    await store.deleteItemAsync(SESSION_TOKENS_KEY, options(store));
    captureException(new Error('Stored session was unreadable and was removed'), {
      area: 'session-tokens',
    });
  }
  lastSaved = session ? JSON.stringify(session) : null;
  return session;
}

let pending: { session: StoredSession | null } | null = null;
let writing: Promise<void> | null = null;

async function write(session: StoredSession | null) {
  const value = session ? JSON.stringify(session) : null;
  if (value === lastSaved) return;
  const store = await loadSecureStore();
  if (value) await store.setItemAsync(SESSION_TOKENS_KEY, value, options(store));
  else await store.deleteItemAsync(SESSION_TOKENS_KEY, options(store));
  lastSaved = value;
}

/**
 * Stores the session (null removes it). Writes run one at a time and only the newest value is
 * written, so a sign-out right after a token renewal can't be overwritten by the renewal.
 * A failed write is reported; the session in memory keeps working.
 */
export function saveStoredSession(session: StoredSession | null): Promise<void> {
  if (!SESSION_TOKENS_PERSISTED) return Promise.resolve();
  pending = { session };
  writing ??= (async () => {
    try {
      while (pending) {
        const next = pending.session;
        pending = null;
        try {
          await write(next);
        } catch (error) {
          if (__DEV__) console.warn('[session] could not store the session', error);
          captureException(error, { area: 'session-tokens' });
        }
      }
    } finally {
      writing = null;
    }
  })();
  return writing;
}

/** Test hook: forget what was read or written. */
export function resetStoredSessionCacheForTests() {
  lastSaved = null;
  pending = null;
  writing = null;
  secureStore = null;
}
