import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteAvatar, getAvatar } from '@/src/api/client';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { useSessionStore } from '@/src/stores/session';

type Avatar = Awaited<ReturnType<typeof getAvatar>>;

/** Keyed on the shopper, not their token, so a token renewal keeps the cached avatar. */
const avatarKey = (userId: string | null) => ['avatar', userId] as const;

export function useAvatar({ enabled = true }: { enabled?: boolean } = {}) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const signedIn = useSessionStore((s) => Boolean(s.accessToken));

  return useQuery({
    queryKey: avatarKey(userId),
    queryFn: () => {
      const accessToken = useSessionStore.getState().accessToken;
      if (!accessToken) throw new Error('Sign in to see your avatar');
      return getAvatar(accessToken);
    },
    enabled: enabled && signedIn,
    // An upload on the avatar screen doesn't touch this cache: refetch on every mount or re-enable.
    staleTime: 0,
  });
}

/** Permanently deletes the user's uploaded photos and avatar. */
export function useDeletePhotos() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!accessToken) throw new Error('Sign in to delete your photos');
      return deleteAvatar(accessToken);
    },
    onSuccess: () => {
      queryClient.setQueryData<Avatar>(avatarKey(userId), {
        status: 'NONE',
        referencePreviewUrl: null,
      });
      return queryClient.invalidateQueries({ queryKey: ['avatar'] });
    },
  });
}
