import { useQuery } from '@tanstack/react-query';

import type { LookbookItem } from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { useLookbookStore } from '@/src/stores/lookbook';
import { useSessionStore } from '@/src/stores/session';

/**
 * The saved listings as feed cards; fetching them also refreshes the store's saved set.
 * Pass `enabled: false` while the screen is out of view: it refetches when re-enabled.
 */
export function useLookbook({ enabled = true }: { enabled?: boolean } = {}) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const signedIn = useSessionStore((s) => Boolean(s.accessToken));
  const revision = useLookbookStore((s) => s.revision);

  return useQuery({
    // Keyed on revision so a piece saved elsewhere shows up once the server has it.
    queryKey: ['lookbook', userId, revision],
    queryFn: () => useLookbookStore.getState().load(),
    enabled: enabled && signedIn,
    // Refetch whenever re-enabled, as promised above.
    staleTime: 0,
    // Keep showing the list while a newer revision loads, but never another account's list.
    placeholderData: (previous: LookbookItem[] | undefined, previousQuery) =>
      previousQuery?.queryKey[1] === userId ? previous : undefined,
  });
}
