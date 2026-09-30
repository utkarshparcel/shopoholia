import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteAvatar, getAvatar } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

type Avatar = Awaited<ReturnType<typeof getAvatar>>;

export function useAvatar({ enabled = true }: { enabled?: boolean } = {}) {
  const accessToken = useSessionStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['avatar', accessToken],
    queryFn: () => {
      if (!accessToken) throw new Error('Sign in to see your avatar');
      return getAvatar(accessToken);
    },
    enabled: enabled && Boolean(accessToken),
  });
}

/** Permanently deletes the user's uploaded photos and avatar. */
export function useDeletePhotos() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!accessToken) throw new Error('Sign in to delete your photos');
      return deleteAvatar(accessToken);
    },
    onSuccess: () => {
      queryClient.setQueryData<Avatar>(['avatar', accessToken], {
        status: 'NONE',
        referencePreviewUrl: null,
      });
      return queryClient.invalidateQueries({ queryKey: ['avatar'] });
    },
  });
}
