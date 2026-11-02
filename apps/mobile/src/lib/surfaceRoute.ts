/**
 * Which side (Worn Play or Worn Closet) a route belongs to, read from expo-router segments.
 * Pathnames drop group names (`/feed`, `/today`), so the group is only in the segments.
 */

import type { Surface } from '@/src/stores/session';

/** The screens in Play's bottom nav (app/(tabs)/_layout.tsx). */
export const PLAY_TAB_KEYS = ['feed', 'lookbook', 'profile'] as const;
/** The screens in Closet's bottom nav (app/(closet)/_layout.tsx). */
export const CLOSET_TAB_KEYS = [
  'today',
  'wardrobe',
  'vault',
  'accountant',
  'recipients',
  'fit',
  'disposition',
] as const;

export type PlayTabKey = (typeof PLAY_TAB_KEYS)[number];
export type ClosetTabKey = (typeof CLOSET_TAB_KEYS)[number];

/** The side a route belongs to; null for the screens of neither (login, cart, checkout, …). */
export function surfaceForSegments(segments: readonly string[]): Surface | null {
  if (segments[0] === '(tabs)') return 'play';
  if (segments[0] === '(closet)') return 'closet';
  return null;
}

/**
 * The switch pill shows on the bottom-nav screens of each side only: over sign-in, onboarding,
 * modals and Closet's own sub-screens it covered their headers and led out of a flow.
 */
export function shouldShowSurfaceToggle(segments: readonly string[]): boolean {
  const screen = segments[1];
  if (!screen) return false;
  switch (surfaceForSegments(segments)) {
    case 'play':
      return (PLAY_TAB_KEYS as readonly string[]).includes(screen);
    case 'closet':
      return (CLOSET_TAB_KEYS as readonly string[]).includes(screen);
    default:
      return false;
  }
}

/** The pill names where a tap goes, not the side already on screen. */
export function surfaceToggleCopy(current: Surface): {
  target: Surface;
  label: string;
  accessibilityLabel: string;
} {
  return current === 'play'
    ? { target: 'closet', label: 'Closet →', accessibilityLabel: 'Switch to Worn Closet' }
    : { target: 'play', label: '← Play', accessibilityLabel: 'Switch to Worn Play' };
}
