import { logout } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

/**
 * Work that needs the session that is ending (it signs its requests with it), e.g. unregistering
 * this device's push token. A step returns null when it has nothing to do, so sign-out stays
 * instant; otherwise sign-out waits for it, but never longer than SIGN_OUT_STEP_TIMEOUT_MS, and a
 * failed step never keeps anyone signed in.
 */
export type BeforeSignOutStep = () => Promise<unknown> | null;

export const SIGN_OUT_STEP_TIMEOUT_MS = 4_000;

const beforeSignOut = new Set<BeforeSignOutStep>();

/** Registers a step to run before the session is cleared; returns its unregister. */
export function onBeforeSignOut(step: BeforeSignOutStep): () => void {
  beforeSignOut.add(step);
  return () => void beforeSignOut.delete(step);
}

function endSession() {
  // Read now, not when sign-out started: a step may have renewed (rotated) the refresh token.
  const { refreshToken, accessToken } = useSessionStore.getState();
  if (!accessToken && !refreshToken) return;
  useSessionStore.getState().clear();
  if (refreshToken) void logout(refreshToken).catch(() => undefined);
}

/**
 * Signs out on purpose. The device forgets the session (the root layout's auth gate then clears
 * the user's data and goes to the login screen), and the server is asked to revoke the refresh
 * token without waiting: offline or a server error never keeps anyone signed in.
 * Steps registered with `onBeforeSignOut` run first, while the session can still sign requests.
 * Not for a renewal the server refused: that token is already dead.
 */
export function signOut(): Promise<void> {
  const running = [...beforeSignOut]
    .map((step) => {
      try {
        return step();
      } catch {
        return null;
      }
    })
    .filter((p): p is Promise<unknown> => p !== null);
  if (running.length === 0) {
    endSession();
    return Promise.resolve();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SIGN_OUT_STEP_TIMEOUT_MS);
  });
  return Promise.race([Promise.allSettled(running), deadline]).then(() => {
    clearTimeout(timer);
    endSession();
  });
}
