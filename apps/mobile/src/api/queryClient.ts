import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { ApiRequestError } from '@/src/api/client';
import { applyClosetQueryDefaults } from '@/src/hooks/closet/keys';
import { isNetInfoOffline } from '@/src/lib/closetScreenState';

/**
 * A query is tried at most 3 times. A refusal (4xx) won't change on a retry, nor will a build
 * with no server address; a timeout, a network blip or a 5xx might.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiRequestError) {
    if (error.code === 'no_api_url') return false;
    return error.status === 0 || error.status >= 500;
  }
  return true;
}

/** The app's one QueryClient: 30s fresh by default, per-domain stale times for the closet. */
export function createAppQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
    },
  });
  applyClosetQueryDefaults(queryClient);
  return queryClient;
}

/**
 * Native has no browser online events: pause queries and mutations while NetInfo reports no
 * network, and refetch when it's back (MOB 23). The web keeps React Query's own listener.
 */
export function wireOnlineManager() {
  if (Platform.OS === 'web') return;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!isNetInfoOffline(state));
    }),
  );
}
