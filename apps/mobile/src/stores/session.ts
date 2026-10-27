import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CLOSET_RESTORE_FALLBACK_TOAST,
  SESSION_STORAGE_KEY,
  hydrateActiveSurface,
} from '@/src/lib/closetRestore';

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
      const raw = await base.getItem(name);
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
      // Only the surface toggle must survive restarts; tokens stay in-memory.
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
        return {
          ...current,
          ...(persisted as object),
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
