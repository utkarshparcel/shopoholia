import { useMutation } from '@tanstack/react-query';

import { deleteVault } from '@/src/api/client';
import { notify } from '@/src/lib/confirm';
import { useSessionStore } from '@/src/stores/session';

/** What the confirmation says gets deleted: everything the account holds in Worn Play. */
export const DELETE_ACCOUNT_TITLE = 'Delete your account?';
export const DELETE_ACCOUNT_MESSAGE =
  'This permanently deletes your WORN account and everything in it: your profile, your avatar ' +
  'and the photos you uploaded, your try-on looks, orders and reveals, your lookbook, your coins ' +
  'and coin history, streaks and referrals. Coins you haven’t spent are lost and can’t be ' +
  'refunded. This can’t be undone.';

/**
 * In-app account deletion (App Store 5.1.1(v), Google Play). The server erases the account before
 * it answers (DELETE /vault, the same erasure Closet uses), which also ends every session; the
 * device then forgets the session, and the root layout's auth gate clears the cached data and goes
 * to the login screen. On an error nothing changes here, so the user can try again.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const accessToken = useSessionStore.getState().accessToken;
      if (!accessToken) throw new Error('Sign in to delete your account.');
      await deleteVault(accessToken);
    },
    onSuccess: () => {
      notify('Account deleted', 'Your WORN account and its data were deleted.');
      useSessionStore.getState().clear();
    },
  });
}
