'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * prefers-reduced-motion, safe to branch on while rendering. framer-motion's useReducedMotion()
 * reads the media query during the first client render, so it is already true while hydrating
 * HTML the server rendered with false, and every branch on it was a hydration mismatch. This
 * reports false on the server and in the hydrating render, then the real value straight after.
 *
 * Entrance animations don't branch on it at all: they always render `reveal` (below) and the
 * app-wide <MotionConfig reducedMotion="user"> makes their movement instant for these users.
 */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Scroll-in entrance for a motion element with `hidden`/`visible` variants. Same markup in every mode. */
export const reveal = {
  initial: 'hidden',
  whileInView: 'visible',
  viewport: { once: true, margin: '-80px' },
} as const;
