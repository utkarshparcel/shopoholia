import { logout } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

/**
 * Signs out on purpose. The device forgets the session at once (the root layout's auth gate then
 * clears the user's data and goes to the login screen), and the server is asked to revoke the
 * refresh token without waiting: offline or a server error never keeps anyone signed in.
 * Not for a renewal the server refused: that token is already dead.
 */
export function signOut(): void {
  const { refreshToken } = useSessionStore.getState();
  useSessionStore.getState().clear();
  if (refreshToken) void logout(refreshToken).catch(() => undefined);
}
