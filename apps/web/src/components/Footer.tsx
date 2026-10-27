'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { gsap } from '@/lib/gsap';

const COLS = [
  {
    h: 'Play',
    links: [
      { label: 'The Drop', href: '/#grwm' },
      { label: 'The Loop', href: '/#loop' },
      { label: 'Coins', href: '/#how-it-works' },
      { label: 'Request early access', href: '/#download' },
    ],
  },
  {
    h: 'Closet',
    links: [
      { label: 'Worn Closet, the next chapter', href: '/closet' },
      { label: 'Plan the week', href: '/closet#today' },
      { label: 'Catalog what you own', href: '/closet#wardrobe' },
      { label: 'Found money', href: '/closet#vault' },
    ],
  },
];

export function Footer() {
  const wordRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // giant wordmark drifts up as the footer enters
  useClientReveal(wordRef, !!reduced);

  return (
    <footer id="footer" aria-label="Footer" className="relative overflow-hidden bg-worn-ink pt-20 text-worn-paper">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-worn-gold/60 to-transparent"
      />
      <div className="section">
        <div className="flex flex-col gap-14 lg:flex-row lg:justify-between">
          {/* brand */}
          <div className="max-w-[360px]">
            <p className="font-display text-3xl">Worn</p>
            <p className="mt-3 text-body-l text-worn-paper/60">
              The shopping app where nothing ships. Browse, try on, haul with
              coins, wait, unbox the renders. The itch, handled.
            </p>
            <a
              href="mailto:hello@worn.app"
              className="mt-6 inline-flex items-center gap-2 font-mono text-micro uppercase tracking-[0.2em] text-worn-gold"
            >
              <Mail size={13} /> hello@worn.app
            </a>
          </div>

          {/* link columns */}
          <nav aria-label="Footer" className="grid grid-cols-2 gap-10">
            {COLS.map((c) => (
              <div key={c.h}>
                <p className="font-mono text-micro uppercase tracking-[0.25em] text-worn-gold">
                  {c.h}
                </p>
                <ul className="mt-5 space-y-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-body text-worn-paper/70 transition-colors hover:text-worn-paper"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-3 border-t border-worn-paper/10 py-6 sm:flex-row">
          <p className="font-mono text-micro tracking-wider text-worn-paper/60">
            © 2026 Worn, Inc.
          </p>
          <p className="font-mono text-micro tracking-wider text-worn-paper/60">
            Made for the 1 AM cart
          </p>
        </div>
      </div>

      {/* giant wordmark */}
      <div ref={wordRef} className="relative select-none" aria-hidden="true">
        <p className="h-[21vw] overflow-hidden text-center font-display leading-[0.8]">
          <span className="block bg-gradient-to-b from-worn-paper/25 to-worn-paper/[0.03] bg-clip-text text-[24vw] text-transparent">
            WORN
          </span>
        </p>
      </div>
    </footer>
  );
}

/* Reveal hook for the wordmark (client-side only) */

function useClientReveal(ref: React.RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: 36, opacity: 0.35 },
        {
          yPercent: 0,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom-=80',
            end: 'bottom bottom',
            scrub: true,
          },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [ref, reduced]);
}
