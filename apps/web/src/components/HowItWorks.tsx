'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
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
    copy: 'Daily streaks pay out on day 1, 3, 7, 14 and 30, from 10 coins up to 100. A friend you refer places a first haul: 100 coins. Buy the real thing through the partner link: 25 coins cashback.',
    icon: Flame,
    stat: 'Streaks 10 → 100 · Referral 100 · Cashback 25',
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
    copy: 'Two scenes come free. Unlock Street, Editorial dark, Night or Candid for 50 each. A new render is 50. Combining two pieces into one look is 75.',
    icon: Sparkles,
    stat: 'Scene 50 · Render 50 · Two pieces 75',
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const track = trackRef.current;
      const section = sectionRef.current;
      if (!track || !section) return;

      const getAmt = () => Math.max(0, track.scrollWidth - window.innerWidth);

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

  const reducedAnim = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-label="Coins, not cash"
      className="relative overflow-hidden bg-worn-paper"
    >
      <div className="flex min-h-screen flex-col justify-center py-20 lg:h-screen lg:py-0">
        <div className="section">
          <motion.div {...reducedAnim} variants={rise} custom={0} className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[640px]">
              <p className="ornament font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
                Coins, not cash
              </p>
              <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
                Coins, not cash. <em className="grad-text">Spent like the real thing.</em>
              </h2>
            </div>
            <p className="hidden font-mono text-[12px] uppercase tracking-[0.25em] text-worn-muted lg:block">
              Keep scrolling →
            </p>
          </motion.div>
        </div>

        {/* horizontal track (desktop) / stacked list (mobile) */}
        <div
          ref={trackRef}
          className="section mt-14 flex flex-col gap-8 lg:mt-20 lg:w-max lg:flex-row lg:gap-10 lg:pl-[max(1rem,calc((100vw-1200px)/2))]"
        >
          {STEPS.map((s) => (
            <article
              key={s.n}
              className="relative flex w-full flex-col justify-between rounded-lg border border-worn-rule bg-worn-surface p-8 shadow-card sm:p-10 lg:h-[54vh] lg:max-h-[560px] lg:w-[62vw] lg:max-w-[720px] lg:flex-none"
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

        {/* progress hairline */}
        <div className="section mt-12 hidden lg:block" aria-hidden="true">
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
