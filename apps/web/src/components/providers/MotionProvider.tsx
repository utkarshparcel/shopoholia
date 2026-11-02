'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Honours prefers-reduced-motion for every framer-motion animation on the site: transforms and
 * layout jump straight to their end state, opacity still fades. Components keep the same
 * `initial` either way, so the server's HTML and the hydrating render always match.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
