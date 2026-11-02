import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { surfaceForSegments } from '@/src/lib/surfaceRoute';
import { useSessionStore } from '@/src/stores/session';

/**
 * Keeps the persisted surface on the side actually on screen. Play links straight into Closet
 * (checkout's "Cut spend", the duplicate banner) without the toggle, and the next cold start
 * then landed back on Play. Screens of neither side (cart, login, …) leave it as it is.
 * Runs only when the side changes, so a sign-out's reset to Play isn't written back over.
 */
export function useActiveSurfaceSync(enabled: boolean) {
  const onScreen = surfaceForSegments(useSegments());

  useEffect(() => {
    if (!enabled || !onScreen) return;
    const { activeSurface, setActiveSurface } = useSessionStore.getState();
    if (activeSurface !== onScreen) setActiveSurface(onScreen);
  }, [enabled, onScreen]);
}
