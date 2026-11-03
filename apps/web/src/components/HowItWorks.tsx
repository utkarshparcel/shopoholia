'use client';

import { useEffect, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useReducedMotionSafe, reveal } from '@/lib/motion';
import { Gift, Flame, ShoppingBag, Sparkles } from 'lucide-react';
import { gsap } from '@/lib/gsap';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.9, ease: EASE },
  }),
};

type Step = {
  n: string;
  title: string;
  copy: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  stat: string;
};

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Start with 500',
    copy: 'Sign in with Google and 500 welcome coins land in your wallet, enough for a piece under 500 tonight. Want more? Coin packs are optional in-app purchases.',
    icon: Gift,
    stat: '500 welcome coins',
  },
  {
    n: '02',
    title: 'Earn by showing up',
    copy: 'Claim your streak every day: 10 coins a day to start, more from day 3, 7 and 14, and 100 a day from day 30. A friend you refer places a first haul: 100 coins.',
    icon: Flame,
    stat: 'Streaks 10 → 100 a day · Referral 100',
  },
  {
    n: '03',
    title: 'Spend on the haul',
    copy: 'Every piece has a coin price, 405 to 1,649 in tonight’s edit. Pay with coins at checkout. In a hurry? Rush to Express for 25.',
    icon: ShoppingBag,
    stat: '405 to 1,649 per piece · Rush 25',
  },
  {
    n: '04',
    title: 'Spend on the reveal',
    copy: 'Two scenes come free. Unlock Street, Editorial dark, Night or Candid for 50 each. A new render is 50. Combine up to four pieces into one look for 75.',
    icon: Sparkles,
    stat: 'Scene 50 · Render 50 · Combine 75',
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();

  useEffect(() => {
    if (reduced) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const track = trackRef.current;
      const section = sectionRef.current;
      if (!track || !section) return;

      // How far the track travels: until the last card's right edge sits as far from the window's
      // right edge as the first card sits from its left. Measured from the cards themselves (less the
      // tween's own x), so the centred column at xl can't leave the last card hanging off-screen.
      const getAmt = () => {
        const cards = track.children;
        const first = cards[0];
        const last = cards[cards.length - 1];
        if (!first || !last) return 0;
        const x = Number(gsap.getProperty(track, 'x')) || 0;
        const left = section.getBoundingClientRect().left;
        const firstLeft = first.getBoundingClientRect().left - x - left;
        const lastRight = last.getBoundingClientRect().right - x - left;
        return Math.max(0, lastRight + firstLeft - section.clientWidth);
      };

      const tween = gsap.to(track, {
        x: () => -getAmt(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${getAmt()}`,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      gsap.fromTo(
        progressRef.current,
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${getAmt()}`,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        },
      );

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });
    return () => mm.revert();
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-label="Coins, not cash"
      className="relative overflow-hidden bg-worn-paper"
    >
      {/* The pin only runs with motion allowed (the effect above). With reduced motion every lg: layout
          rule below is motion-safe, so the cards fall back to a grid that fits the window instead of one
          row wider than it, clipped by the section's overflow-hidden with nothing to scroll it along. */}
      <div className="flex min-h-screen flex-col justify-center py-20 lg:motion-safe:h-screen lg:motion-safe:py-0">
        <div className="section w-full">
          <motion.div {...reveal} variants={rise} custom={0} className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[640px]">
              <p className="ornament font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
                Coins, not cash
              </p>
              <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
                Coins, not cash. <em className="grad-text">Spent like the real thing.</em>
              </h2>
            </div>
            <p className="hidden font-mono text-[12px] uppercase tracking-[0.25em] text-worn-muted lg:motion-safe:block">
              Keep scrolling →
            </p>
          </motion.div>
        </div>

        {/* horizontal track (desktop) / two-by-two grid (desktop, reduced motion) / stacked list (mobile) */}
        <div className="section mt-14 w-full lg:mt-20">
          <div
            ref={trackRef}
            className="flex flex-col gap-8 lg:motion-safe:w-max lg:motion-safe:flex-row lg:motion-safe:gap-10 lg:motion-reduce:grid lg:motion-reduce:grid-cols-2"
          >
            {STEPS.map((s) => (
              <article
                key={s.n}
                className="relative flex w-full flex-col justify-between rounded-lg border border-worn-rule bg-worn-surface p-8 shadow-card sm:p-10 lg:motion-safe:h-[54vh] lg:motion-safe:max-h-[560px] lg:motion-safe:w-[62vw] lg:motion-safe:max-w-[720px] lg:motion-safe:flex-none"
              >
                <div className="flex items-start justify-between">
                  <span aria-hidden="true" className="font-display text-[88px] leading-[0.85] text-stroke-ink">
                    {s.n}
                  </span>
                  <span className="grid h-14 w-14 place-items-center rounded-full border border-worn-gold/40 bg-worn-gold-tint text-worn-gold-deep">
                    <s.icon size={24} />
                  </span>
                </div>
                <div className="mt-10">
                  <h3 className="font-display text-[clamp(30px,3.4vw,46px)] text-worn-ink">{s.title}</h3>
                  <p className="mt-4 max-w-[48ch] text-body-l text-worn-ink-soft">{s.copy}</p>
                  <p className="mt-8 inline-flex rounded-pill border border-worn-gold/35 bg-worn-gold-tint px-4 py-2 font-mono text-micro uppercase tracking-[0.14em] text-worn-gold-deep">
                    {s.stat}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* progress hairline */}
        <div className="section mt-12 hidden w-full lg:motion-safe:block" aria-hidden="true">
          <div className="h-px w-full bg-worn-rule">
            <div
              ref={progressRef}
              className="h-px w-full origin-left bg-gradient-to-r from-worn-gold-deep via-worn-gold to-worn-gold-deep"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
