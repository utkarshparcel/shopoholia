import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CLOSET_RESTORE_FALLBACK_TOAST,
  SESSION_STORAGE_KEY,
  hydrateActiveSurface,
} from '@/src/lib/closetRestore';

import { captureException } from '@/src/lib/sentry';

import {
  SESSION_TOKENS_PERSISTED,
  parseStoredSession,
  readStoredSession,
  saveStoredSession,
  type StoredSession,
} from './sessionTokens';

export type Surface = 'play' | 'closet';

type SessionState = {
  phone: string | null;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  coinBalance: number;
  activeSurface: Surface;
  /** W005 — set when corrupt persist forced Play fallback (UI shows toast once). */
  restoreFallbackToast: string | null;
  /** False until the stored session has been read at launch; screens wait for it before routing. */
  tokensHydrated: boolean;
  setSession: (data: {
    phone?: string | null;
    email?: string | null;
    accessToken: string;
    refreshToken: string;
    coinBalance?: number;
  }) => void;
  /** Swaps in renewed tokens for the same signed-in user. */
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setCoinBalance: (balance: number) => void;
  setActiveSurface: (surface: Surface) => void;
  clearRestoreFallbackToast: () => void;
  clear: () => void;
};

/** AsyncStorage wrapper that recovers from corrupt Closet surface JSON (W005). */
function createSafeSessionStorage() {
  const base = AsyncStorage;
  return {
    getItem: async (name: string): Promise<string | null> => {
      // A failed read starts on Play: a rejected read would leave the store, and the root
      // layout's splash gate, waiting for hydration forever.
      const raw = await base.getItem(name).catch(() => null);
      if (name !== SESSION_STORAGE_KEY) return raw;
      const result = hydrateActiveSurface(raw);
      if (result.recovered) {
        // Rewrite a safe Play payload so the next launch is clean.
        const safe = JSON.stringify({
          state: { activeSurface: 'play' },
          version: 0,
        });
        await base.setItem(name, safe);
        // Signal via a side channel key read on rehydrate.
        await base.setItem(
          `${SESSION_STORAGE_KEY}:restore-fallback`,
          result.reason ?? 'corrupt',
        );
        return safe;
      }
      return raw;
    },
    setItem: (name: string, value: string) => base.setItem(name, value),
    removeItem: (name: string) => base.removeItem(name),
  };
}

export async function consumeRestoreFallbackFlag(): Promise<boolean> {
  const key = `${SESSION_STORAGE_KEY}:restore-fallback`;
  const flag = await AsyncStorage.getItem(key);
  if (!flag) return false;
  await AsyncStorage.removeItem(key);
  return true;
}

export const useSessionStore = create<SessionState>()(
  persist(
    // persist's `set` returns the storage write promise; the actions stay synchronous (void).
    (set) => ({
      phone: null,
      email: null,
      accessToken: null,
      refreshToken: null,
      coinBalance: 0,
      activeSurface: 'play',
      restoreFallbackToast: null,
      tokensHydrated: !SESSION_TOKENS_PERSISTED,
      setSession: ({ phone = null, email = null, accessToken, refreshToken, coinBalance = 0 }) => {
        set({ phone, email, accessToken, refreshToken, coinBalance });
      },
      setTokens: ({ accessToken, refreshToken }) => {
        set({ accessToken, refreshToken });
      },
      setCoinBalance: (coinBalance) => {
        set({ coinBalance });
      },
      setActiveSurface: (activeSurface) => {
        set({ activeSurface });
      },
      clearRestoreFallbackToast: () => {
        set({ restoreFallbackToast: null });
      },
      clear: () => {
        set({
          phone: null,
          email: null,
          accessToken: null,
          refreshToken: null,
          coinBalance: 0,
          activeSurface: 'play',
          restoreFallbackToast: null,
        });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => createSafeSessionStorage()),
      // Only the surface toggle goes to AsyncStorage. Tokens live in the secure store (sessionTokens.ts).
      partialize: (state) => ({ activeSurface: state.activeSurface }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { activeSurface?: unknown };
        const surface =
          p.activeSurface === 'closet' || p.activeSurface === 'play'
            ? p.activeSurface
            : 'play';
        const recovered =
          p.activeSurface != null &&
          p.activeSurface !== 'closet' &&
          p.activeSurface !== 'play';
        // Nothing but the surface is read back, so tokens an older payload held never reach state.
        return {
          ...current,
          activeSurface: surface,
          restoreFallbackToast: recovered
            ? CLOSET_RESTORE_FALLBACK_TOAST
            : current.restoreFallbackToast,
        };
      },
      onRehydrateStorage: () => (state) => {
        void consumeRestoreFallbackFlag().then((hit) => {
          if (hit) {
            useSessionStore.setState({
              activeSurface: 'play',
              restoreFallbackToast: CLOSET_RESTORE_FALLBACK_TOAST,
            });
          }
        });
        if (state && state.activeSurface !== 'play' && state.activeSurface !== 'closet') {
          useSessionStore.setState({
            activeSurface: 'play',
            restoreFallbackToast: CLOSET_RESTORE_FALLBACK_TOAST,
          });
        }
      },
    },
  ),
);

function sessionFrom(state: SessionState): StoredSession | null {
  if (!state.accessToken || !state.refreshToken) return null;
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    phone: state.phone,
    email: state.email,
  };
}

/**
 * Tokens an older build left in the AsyncStorage session payload. They're removed from it either
 * way; on native they're returned so they can move to the secure store.
 */
async function takeLegacyTokens(): Promise<StoredSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  let payload: { state?: Record<string, unknown>; version?: number };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return null; // The safe storage wrapper repairs a corrupt payload.
  }
  const state = payload?.state;
  if (!state || !('accessToken' in state || 'refreshToken' in state)) return null;
  await AsyncStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      state: { activeSurface: useSessionStore.getState().activeSurface },
      version: payload.version ?? 0,
    }),
  );
  return SESSION_TOKENS_PERSISTED ? parseStoredSession(JSON.stringify(state)) : null;
}

let persistence: Promise<void> | null = null;

/**
 * Restores the stored session at launch, then keeps the secure store in step with the session:
 * every sign-in, renewal and sign-out is written (sign-out removes it). Runs once.
 */
export function startSessionTokenPersistence(): Promise<void> {
  persistence ??= (async () => {
    // Subscribe first, so a sign-in that finishes while the store is being read is still saved.
    useSessionStore.subscribe((state, prev) => {
      if (
        state.accessToken !== prev.accessToken ||
        state.refreshToken !== prev.refreshToken ||
        state.phone !== prev.phone ||
        state.email !== prev.email
      ) {
        void saveStoredSession(sessionFrom(state));
      }
    });
    let stored: StoredSession | null = null;
    try {
      const legacy = await takeLegacyTokens().catch((error: unknown) => {
        captureException(error, { area: 'session-tokens' });
        return null;
      });
      stored = (await readStoredSession()) ?? legacy;
    } catch (error) {
      // The secure store couldn't be read: start signed out rather than hang on the splash.
      captureException(error, { area: 'session-tokens' });
    } finally {
      // One update, so nothing routes with the tokens but before `tokensHydrated`.
      // A sign-in that finished while reading wins over what was stored.
      const restore = stored && !useSessionStore.getState().accessToken ? stored : {};
      useSessionStore.setState({ ...restore, tokensHydrated: true });
    }
  })();
  return persistence;
}
