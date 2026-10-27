import { useEffect, useState } from 'react';

import { isNetInfoOffline } from '@/src/lib/closetScreenState';

export type NetworkStatus = {
  /** True when the device reports no usable network. */
  isOffline: boolean;
};

type NetInfoLike = {
  addEventListener: (
    listener: (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void,
  ) => () => void;
  fetch: () => Promise<{ isConnected: boolean | null; isInternetReachable: boolean | null }>;
};

/**
 * Closet offline signal. Prefers `@react-native-community/netinfo` when present;
 * falls back to `navigator.onLine` (web / vitest).
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    async function attach() {
      try {
        const mod = (await import('@react-native-community/netinfo')) as {
          default: NetInfoLike;
        };
        if (cancelled) return;
        const NetInfo = mod.default;
        const initial = await NetInfo.fetch();
        if (!cancelled) setIsOffline(isNetInfoOffline(initial));
        unsubscribe = NetInfo.addEventListener((state) => {
          setIsOffline(isNetInfoOffline(state));
        });
        return;
      } catch {
        // package optional in some test/web shells
      }

      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        const sync = () => setIsOffline(!navigator.onLine);
        sync();
        if (typeof window !== 'undefined') {
          window.addEventListener('online', sync);
          window.addEventListener('offline', sync);
          unsubscribe = () => {
            window.removeEventListener('online', sync);
            window.removeEventListener('offline', sync);
          };
        }
      }
    }

    void attach();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { isOffline };
}

/** Pure helper for tests — maps NetInfo-ish state to offline. */
export function isOfflineFromNetInfo(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return isNetInfoOffline(state);
}
