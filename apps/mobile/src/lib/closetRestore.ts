/**
 * W005 — crash-safe Closet surface restore from AsyncStorage.
 * Corrupt / unexpected payloads fall back to Play (never white-screen Closet).
 */

import type { Surface } from '@/src/stores/session';

export const SESSION_STORAGE_KEY = 'worn-session' as const;

export type SurfaceHydrateResult = {
  surface: Surface;
  /** True when stored payload was missing, corrupt, or invalid. */
  recovered: boolean;
  reason?: 'missing' | 'corrupt' | 'invalid_surface';
};

/** Parse persisted zustand JSON for activeSurface only. */
export function hydrateActiveSurface(
  raw: string | null | undefined,
): SurfaceHydrateResult {
  if (raw == null || raw === '') {
    return { surface: 'play', recovered: false, reason: 'missing' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { surface: 'play', recovered: true, reason: 'corrupt' };
  }

  if (parsed == null || typeof parsed !== 'object') {
    return { surface: 'play', recovered: true, reason: 'corrupt' };
  }

  const state = (parsed as { state?: unknown }).state;
  if (state == null || typeof state !== 'object') {
    // Empty / partial persist without state — treat as Play default, not crash.
    return { surface: 'play', recovered: false, reason: 'missing' };
  }

  const activeSurface = (state as { activeSurface?: unknown }).activeSurface;
  if (activeSurface === 'closet' || activeSurface === 'play') {
    return { surface: activeSurface, recovered: false };
  }

  return { surface: 'play', recovered: true, reason: 'invalid_surface' };
}

/** Toast / banner copy when Closet restore falls back to Play. */
export const CLOSET_RESTORE_FALLBACK_TOAST =
  'Closet couldn’t restore — starting in Play. Your Closet is one tap away.';

export function shouldToastRestoreFallback(result: SurfaceHydrateResult): boolean {
  return result.recovered;
}
