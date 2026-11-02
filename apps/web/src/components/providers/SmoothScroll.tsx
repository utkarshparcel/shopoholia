'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap, ScrollTrigger } from '@/lib/gsap';

const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const lenisNow = () => (window as unknown as { __lenis?: Lenis }).__lenis;

/**
 * Where an in-page anchor should rest: the target's top edge at the top of the window, unless
 * that tucks its content (the first line after its top padding) under a fixed header that stays
 * on screen, in which case it sits 12px below the header. Same rule as ClosetPager's section
 * stops, so a jump lands on a stop the pager recognises. A header marked data-autohide (Play's)
 * gets out of the way during a jump instead, so pinned stages land exactly where their pin starts.
 */
function anchorY(el: HTMLElement) {
  const header = document.querySelector<HTMLElement>('header.fixed:not([data-autohide])');
  const head = header ? header.offsetTop + header.offsetHeight + 12 : 0;
  const pad = el.matches('.section-py') ? el : el.querySelector<HTMLElement>(':scope > .section-py');
  const padTop = pad ? parseFloat(getComputedStyle(pad).paddingTop) || 0 : 0;
  // A GSAP-pinned section (the demo, the Coins track) lives in a .pin-spacer. While pinned it is
  // position: fixed, and once the page is past the pin it is translated to the pin's end, so its own
  // box says where the pin finished, not where it starts: a jump from below landed on the last step.
  // The spacer stays in flow and its top is where the pin begins, so measure that instead.
  const spacer = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : null;
  const top = (spacer ?? el).getBoundingClientRect().top + window.scrollY - Math.max(0, head - padTop);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(max, Math.round(top)));
}

/* While a jump runs <html> carries this, and a data-autohide header keeps itself hidden. */
const JUMP = 'data-anchor-jump';
let jumpTimer: ReturnType<typeof setTimeout> | undefined;
function jumpStart(ms: number) {
  document.documentElement.setAttribute(JUMP, '');
  clearTimeout(jumpTimer);
  jumpTimer = setTimeout(jumpEnd, ms); // never outlives the glide, even if it is cut short
}
function jumpEnd() {
  clearTimeout(jumpTimer);
  document.documentElement.removeAttribute(JUMP);
}

/** Moves keyboard focus to the target without scrolling, as a fragment jump should. */
function focusTarget(el: HTMLElement) {
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) {
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-anchor-target', '');
  }
  el.focus({ preventScroll: true });
}

/**
 * Scrolls to `el` with Lenis (or instantly without it), then checks again where it ended up:
 * content passed on the way (accordions inside step tracks, late images, pin spacers) can move the
 * target while the glide is running, so each settle re-aims until it is on the mark.
 */
function scrollToAnchor(el: HTMLElement, tries = 3) {
  const y = anchorY(el);
  const lenis = lenisNow();
  if (!lenis) {
    jumpStart(150); // the scroll event of an instant jump still arrives a frame later
    window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    return;
  }
  const dist = Math.abs(y - window.scrollY);
  const duration = Math.min(1.6, 0.7 + (dist / window.innerHeight) * 0.05);
  jumpStart((duration + 0.6) * 1000);
  lenis.scrollTo(y, {
    duration,
    easing: inOutCubic,
    force: true,
    onComplete: () => {
      if (tries > 1 && Math.abs(anchorY(el) - window.scrollY) > 2) {
        requestAnimationFrame(() => scrollToAnchor(el, tries - 1));
      } else {
        jumpStart(150);
      }
    },
  });
}

/**
 * Buttery-smooth scrolling (Lenis) synced with the GSAP ticker so every
 * ScrollTrigger stays frame-perfect. Respects prefers-reduced-motion.
 *
 * In-page anchors are handled here too, with or without Lenis: CSS smooth scrolling fought Lenis
 * and was cancelled whenever framer-motion measured a layout (it calls window.scrollTo), so jumps
 * stopped short.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      smoothWheel: true,
    });

    const onScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onScroll);
    // exposed for tests / automation, and for the anchor handling below and ClosetPager
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Recalculate once webfonts/layout settle
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    const t = setTimeout(refresh, 600);

    return () => {
      window.removeEventListener('load', refresh);
      clearTimeout(t);
      gsap.ticker.remove(raf);
      lenis.off('scroll', onScroll);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  useEffect(() => {
    // Capture phase on window: runs before next/link's own hash handling, which then sees
    // defaultPrevented and leaves the scroll to us.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      const hash = a?.getAttribute('href');
      if (!a || !hash || hash.length < 2 || a.target) return;
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!el) return;
      e.preventDefault();
      if (location.hash !== hash) history.pushState(history.state, '', hash);
      // The skip link only needs to move focus past the header: the reader is already in <main>.
      if (el.tagName !== 'MAIN') scrollToAnchor(el);
      focusTarget(el);
    };
    window.addEventListener('click', onClick, true);

    // A hash typed into the address bar, or Back/Forward between anchors: the browser has already
    // jumped by scroll-margin; settle it on the same mark a click would.
    const onHashChange = () => {
      const el = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      if (el) scrollToAnchor(el);
    };
    window.addEventListener('hashchange', onHashChange);

    // The reader taking over (wheel, touch, keys) ends a jump at once, so the header answers them.
    const takeOver = () => jumpEnd();
    window.addEventListener('wheel', takeOver, { passive: true });
    window.addEventListener('touchstart', takeOver, { passive: true });
    window.addEventListener('keydown', takeOver);

    // Arriving with a hash (e.g. /closet#vault): the browser jumped before the pins and step
    // tracks laid themselves out, so aim again once they have.
    let t: ReturnType<typeof setTimeout> | undefined;
    const hash = location.hash;
    if (hash.length > 1) {
      let moved = false;
      const stop = () => (moved = true);
      const opts = { once: true, passive: true } as const;
      window.addEventListener('wheel', stop, opts);
      window.addEventListener('touchstart', stop, opts);
      window.addEventListener('keydown', stop, opts);
      t = setTimeout(() => {
        window.removeEventListener('wheel', stop);
        window.removeEventListener('touchstart', stop);
        window.removeEventListener('keydown', stop);
        const el = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!moved && el) {
          const y = anchorY(el);
          const lenis = lenisNow();
          if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
          else window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
        }
      }, 900);
    }

    return () => {
      clearTimeout(t);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('wheel', takeOver);
      window.removeEventListener('touchstart', takeOver);
      window.removeEventListener('keydown', takeOver);
      jumpEnd();
    };
  }, []);

  return <>{children}</>;
}
