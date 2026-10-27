'use client';

import { useEffect } from 'react';
import { stepTracks } from './useScrollSteps';

type LenisLike = {
  isScrolling: boolean | 'native' | 'smooth';
  targetScroll: number;
  scrollTo: (y: number, opts?: { immediate?: boolean; duration?: number; easing?: (t: number) => number }) => void;
};

type Stop = { y: number; rank: number; track?: HTMLElement };

const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const lenisNow = () => (window as unknown as { __lenis?: LenisLike }).__lenis;

/**
 * Every place the page rests, top to bottom: each section, each step of a step track, and
 * enough in between that no part of a tall section is only ever seen mid-scroll.
 */
function stopsNow(): Stop[] {
  const h = window.innerHeight;
  const max = Math.max(0, document.documentElement.scrollHeight - h);
  const clamp = (y: number) => Math.max(0, Math.min(max, Math.round(y)));
  const head = document.querySelector<HTMLElement>('header.fixed')?.getBoundingClientRect().bottom ?? 0;
  const raw: Stop[] = [
    { y: 0, rank: 3 },
    { y: max, rank: 3 },
  ];
  document.querySelectorAll<HTMLElement>('main section').forEach((s) => {
    const pad = s.querySelector<HTMLElement>(':scope > .section-py');
    const padTop = pad ? parseFloat(getComputedStyle(pad).paddingTop) || 0 : 0;
    // The section's top edge at the top of the window, unless that tucks its heading under the header.
    const y = s.getBoundingClientRect().top + window.scrollY - Math.max(0, head + 12 - padTop);
    raw.push({ y: clamp(y), rank: 1 });
  });
  stepTracks.forEach(({ track, rests }) => rests().forEach((y) => raw.push({ y: clamp(y), rank: 2, track })));
  raw.sort((a, b) => a.y - b.y);

  // Two stops this close read as a gesture that did nothing: keep the one that matters more.
  const gap = Math.max(140, h * 0.16);
  const kept: Stop[] = [];
  for (const s of raw) {
    const last = kept[kept.length - 1];
    if (last && s.y - last.y < gap && !(s.track && s.track === last.track)) {
      if (s.rank > last.rank) kept[kept.length - 1] = s;
    } else kept.push(s);
  }

  const stops: Stop[] = [];
  kept.forEach((s, i) => {
    const prev = kept[i - 1];
    if (prev && !(s.track && s.track === prev.track)) {
      const room = s.y - prev.y - h;
      if (room > h * 0.25) {
        const m = Math.ceil(room / (h * 0.9));
        for (let j = 1; j <= m; j++) stops.push({ y: Math.round(prev.y + (room * j) / m), rank: 0 });
      }
    }
    stops.push(s);
  });
  return stops;
}

function trackAt(y: number) {
  for (const { track, rests } of stepTracks) {
    const r = rests();
    if (y >= r[0] - 2 && y <= r[r.length - 1] + 2) return track;
  }
  return undefined;
}

/** True when the wheel is over something that scrolls on its own. */
function scrollsItself(t: EventTarget | null) {
  for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) {
    if (el.hasAttribute('data-lenis-prevent')) return true;
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Pages /closet one stop per wheel gesture or key press: section to section, and through every
 * step of a step track before leaving it. A step inside the same track switches at once (the
 * frame is stuck, so there is nothing to glide past); anything else glides. Touch stays native.
 */
export function ClosetPager() {
  useEffect(() => {
    let lockUntil = 0;
    let queued: { dir: 1 | -1; edge: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastT = 0;
    let lastDir = 0;
    let peak = 0;
    let trough = 0;

    // Moves one stop (or to the first or last); returns how long to hold further input.
    const move = (dir: 1 | -1, edge: boolean) => {
      const lenis = lenisNow();
      const base = lenis?.isScrolling === 'smooth' ? lenis.targetScroll : window.scrollY;
      const stops = stopsNow();
      // Within this of a stop counts as being on it (an anchor jump lands a little above one).
      const near = Math.max(100, window.innerHeight * 0.12);
      const target = edge
        ? stops[dir > 0 ? stops.length - 1 : 0]
        : dir > 0
          ? stops.find((s) => s.y > base + near)
          : [...stops].reverse().find((s) => s.y < base - near);
      if (!target || Math.abs(target.y - base) < 1) return 0;
      if (target.track && target.track === trackAt(base)) {
        if (lenis) lenis.scrollTo(target.y, { immediate: true });
        else window.scrollTo({ top: target.y, behavior: 'instant' as ScrollBehavior });
        return 520;
      }
      const dur = Math.min(1.1, 0.6 + (Math.abs(target.y - base) / window.innerHeight) * 0.2);
      if (lenis) lenis.scrollTo(target.y, { duration: dur, easing: inOutCubic });
      else window.scrollTo({ top: target.y, behavior: 'instant' as ScrollBehavior });
      return lenis ? dur * 850 : 520;
    };

    // A gesture that lands mid-move goes once the move settles; only the latest one is kept.
    const request = (dir: 1 | -1, edge = false) => {
      const now = performance.now();
      if (now < lockUntil) {
        queued = { dir, edge };
        clearTimeout(timer);
        timer = setTimeout(() => {
          const q = queued;
          queued = null;
          if (q) request(q.dir, q.edge);
        }, lockUntil - now);
        return;
      }
      lockUntil = now + move(dir, edge);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || scrollsItself(e.target)) return;
      // Lenis listens further along; it never sees a wheel the pager handles.
      e.preventDefault();
      e.stopPropagation();
      const a = Math.abs(e.deltaY);
      if (!a) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const now = performance.now();
      // A new gesture: a pause, a change of direction, or a fresh push while the last one's momentum fades.
      const fresh = now - lastT > 160 || dir !== lastDir || (trough < peak * 0.6 && a > Math.max(16, trough * 2.5));
      lastT = now;
      lastDir = dir;
      if (fresh || a > peak) {
        peak = a;
        trough = a;
      } else if (a < trough) trough = a;
      if (fresh) request(dir);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      let dir: 1 | -1;
      let edge = false;
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
          dir = 1;
          break;
        case 'ArrowUp':
        case 'PageUp':
          dir = -1;
          break;
        case ' ':
          if (t?.closest('a, button, summary, [role="button"]')) return;
          dir = e.shiftKey ? -1 : 1;
          break;
        case 'Home':
          dir = -1;
          edge = true;
          break;
        case 'End':
          dir = 1;
          edge = true;
          break;
        default:
          return;
      }
      e.preventDefault();
      request(dir, edge);
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return null;
}
