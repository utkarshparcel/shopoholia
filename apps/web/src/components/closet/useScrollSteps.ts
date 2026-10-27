'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { ScrollTrigger } from '@/lib/gsap';

type LenisLike = { scrollTo: (y: number, opts?: { immediate?: boolean }) => void };

/** Scroll each step takes, as DropStage's beats do. Put a spacer this tall after the sticky block. */
export const stepSpace = (count: number) => `calc(${count} * max(320px, 55svh))`;

/** A mounted step track and the scroll position each of its steps rests at. */
export type StepTrack = { track: HTMLElement; rests: () => number[] };

/** Every mounted step track, so ClosetPager can stop at each step. */
export const stepTracks = new Set<StepTrack>();

/**
 * Where step `i` rests. The first sits where the text above the track has just left the window
 * and the last where the section below is about to enter it, so no resting frame shows a sliver
 * of either.
 */
function restAt(st: ScrollTrigger, track: HTMLElement, count: number, i: number) {
  if (i > 0 && i < count - 1) return st.start + ((i + 0.5) / count) * (st.end - st.start);
  const top = track.getBoundingClientRect().top + window.scrollY;
  if (i <= 0) return Math.max(st.start, top - (parseFloat(getComputedStyle(track).marginTop) || 0));
  return Math.min(st.end, top + track.offsetHeight - window.innerHeight);
}

/**
 * Steps through `count` states as the page scrolls: `stickRef` (a CSS-sticky first child of
 * `trackRef`) holds still while the spacer after it scrolls by, one equal share per step.
 * `jumpTo` moves the scroll to a step, so the scroll position stays the one source of truth.
 */
export function useScrollSteps(count: number, onStep: (i: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const stepRef = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useLayoutEffect(() => {
    const track = trackRef.current;
    const stick = stickRef.current;
    if (!track || !stick) return;
    // .step-stick centres the block in the window under the header by this height.
    const fit = () => stick.style.setProperty('--sh', `${stick.offsetHeight}px`);
    fit();
    const st = ScrollTrigger.create({
      trigger: track,
      start: () => `top top+=${parseFloat(getComputedStyle(stick).top) || 0}`,
      end: () => `+=${Math.max(1, track.offsetHeight - stick.offsetHeight)}`,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const i = Math.max(0, Math.min(count - 1, Math.floor(self.progress * count)));
        if (i === stepRef.current) return;
        stepRef.current = i;
        onStepRef.current(i);
      },
    });
    stRef.current = st;
    const entry: StepTrack = { track, rests: () => Array.from({ length: count }, (_, i) => restAt(st, track, count, i)) };
    stepTracks.add(entry);
    // Content above can change height after load (fonts, images), and the block itself with the
    // window (it holds one height through every step); keep it centred and the run lined up.
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            fit();
            st.refresh();
          });
    ro?.observe(document.body);
    ro?.observe(stick);
    return () => {
      ro?.disconnect();
      stepTracks.delete(entry);
      st.kill();
      stRef.current = null;
    };
  }, [count]);

  const jumpTo = useCallback(
    (i: number) => {
      const st = stRef.current;
      const track = trackRef.current;
      if (!st || !track) return;
      const y = restAt(st, track, count, Math.max(0, Math.min(count - 1, i)));
      const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
      if (lenis) lenis.scrollTo(y, { immediate: true });
      else window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    },
    [count],
  );

  return { trackRef, stickRef, jumpTo };
}
