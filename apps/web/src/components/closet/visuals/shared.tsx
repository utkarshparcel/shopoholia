'use client';

import type { ReactNode } from 'react';
import type { Variants } from 'framer-motion';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* Visuals never set initial/animate themselves: every motion child inherits
   hidden → visible from its section's wrapper in ClosetFeatures, so the
   scroll trigger, the once-only entrance and the reduced-motion fallback
   (initial: 'visible', the finished screen) all live in one place. */

export const lift: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.7, ease: EASE },
  }),
};

export const grow: Variants = {
  hidden: { scaleX: 0 },
  visible: (d: number) => ({
    scaleX: 1,
    transition: { delay: d, duration: 1.1, ease: EASE },
  }),
};

export const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (d: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { delay: d, duration: 1.3, ease: EASE, opacity: { delay: d, duration: 0.2 } },
  }),
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.4 },
  visible: (d: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: d, duration: 0.5, ease: EASE },
  }),
};

/* The Worn Closet hanger, as an app icon */
export function AppMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-worn-ink"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-worn-gold"
      >
        <path d="M12 4.2a2.3 2.3 0 1 1 2.3 2.3c-1.27 0-2.3.9-2.3 2.1v1.4" />
        <path d="M12 10 2.7 16.7a1.35 1.35 0 0 0 .8 2.45h17a1.35 1.35 0 0 0 .8-2.45L12 10Z" />
      </svg>
    </span>
  );
}

/* Every visual is illustrative: the numbers are sample data, and say so */
export function SampleTag() {
  return (
    <span className="shrink-0 rounded-pill border border-worn-rule bg-worn-paper px-2 py-px font-mono text-micro uppercase tracking-[0.16em] text-worn-muted">
      Sample
    </span>
  );
}

/* Shell for an app screen: hairline card, app bar, Sample tag */
export function Screen({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-worn-rule bg-worn-surface shadow-pop ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-worn-rule/70 px-4 py-2.5 sm:px-5">
        <AppMark />
        <p className="min-w-0 flex-1 truncate font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">
          {title}
        </p>
        <SampleTag />
      </div>
      {children}
    </div>
  );
}

/* Product photo crop: object-cover, optionally zoomed in on the garment */
export function Thumb({
  src,
  className = '',
  focus = '50% 45%',
  zoom = 1,
}: {
  src: string;
  className?: string;
  focus?: string;
  zoom?: number;
}) {
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-worn-warm-deep ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: focus,
          transformOrigin: focus,
          transform: zoom === 1 ? undefined : `scale(${zoom})`,
        }}
      />
    </span>
  );
}

/* Soft gold glow behind a visual, so the glass has something to catch */
export function Glow({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 rounded-full blur-3xl ${className}`}
      style={{ background: 'radial-gradient(closest-side, rgba(200,168,122,0.26), transparent)' }}
    />
  );
}
