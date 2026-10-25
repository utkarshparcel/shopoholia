'use client';

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  ShoppingBag,
  ScanFace,
  Coins,
  Hourglass,
  Sparkles,
  BookImage,
  ArrowDownRight,
} from 'lucide-react';
import { gsap } from '@/lib/gsap';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

type Feature = {
  n: string;
  title: string;
  copy: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  chip: { k: string; v: string }[];
};

const FEATURES: Feature[] = [
  {
    n: '01',
    title: 'The feed',
    copy: 'Curated for you, every night. Tonight’s edit is 40 real pieces from NEWME, ranked by a five-question style quiz.',
    icon: ShoppingBag,
    chip: [
      { k: 'Tonight', v: '40 pieces' },
      { k: 'Ranked by', v: 'your style quiz' },
    ],
  },
  {
    n: '02',
    title: 'Try on me',
    copy: 'One photo makes your avatar. Open any listing, tap Try on me, and see the piece on you before you decide.',
    icon: ScanFace,
    chip: [
      { k: 'Photos needed', v: '1' },
      { k: 'Rendered', v: 'on your avatar' },
    ],
  },
  {
    n: '03',
    title: 'Haul it',
    copy: 'Add to haul, check the haul total, pay with coins. Pick Express, Standard or Slow burn. No card, ever.',
    icon: Coins,
    chip: [
      { k: 'Currency', v: 'coins' },
      { k: 'Delivery speeds', v: '3' },
    ],
  },
  {
    n: '04',
    title: 'The wait',
    copy: 'Processing, Packed, Out for delivery, Arriving soon, Delivered. A push at every step, so the wait feels like the real thing.',
    icon: Hourglass,
    chip: [
      { k: 'Express', v: 'about 2 hrs' },
      { k: 'Slow burn', v: '48 hrs' },
    ],
  },
  {
    n: '05',
    title: 'The reveal',
    copy: 'Your haul is here. Six scenes of you in each piece. Studio and Golden hour are free. Street, Editorial dark, Night and Candid unlock for coins.',
    icon: Sparkles,
    chip: [
      { k: 'Free scenes', v: '2' },
      { k: 'Unlock a scene', v: '50 coins' },
    ],
  },
  {
    n: '06',
    title: 'The lookbook',
    copy: 'Every piece you keep lives in your lookbook. Share the photos anywhere. If you still want the real thing, Buy for real opens the partner link.',
    icon: BookImage,
    chip: [
      { k: 'Share', v: 'anywhere' },
      { k: 'The real thing', v: 'only if you still want it' },
    ],
  },
];

export function Features() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // As each card arrives, the stack below it recedes
  useEffect(() => {
    if (reduced) return;
    const root = sectionRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-stacked]'));
    const ctx = gsap.context(() => {
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return;
        // scale only: fading a glass card lets the unblurred text of the cards beneath show through
        gsap.to(card, {
          scale: 0.9,
          ease: 'none',
          scrollTrigger: {
            trigger: cards[i + 1],
            start: 'top bottom',
            end: 'top top+=140',
            scrub: true,
          },
        });
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  const reducedAnim = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section
      ref={sectionRef}
      id="features"
      aria-label="Features"
      className="relative bg-warm py-24 lg:py-36"
    >
      <div className="section">
        <motion.div {...reducedAnim} variants={rise} custom={0} className="max-w-[760px]">
          <p className="ornament font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            The play
          </p>
          <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
            The whole buying ritual.{' '}
            <em className="grad-text">Minus the bill, the parcel and the pile.</em>
          </h2>
          <p className="mt-5 max-w-[52ch] text-body-l text-worn-ink-soft">
            Six screens, one loop. Keep scrolling. They stack like the hauls you
            keep placing.
          </p>
        </motion.div>
      </div>

      <div className="section relative mt-16 flex flex-col gap-[12vh] pb-[16vh]">
        {FEATURES.map((f, i) => (
          <article
            key={f.n}
            data-stacked
            className="glass sticky mx-auto w-full max-w-[860px] rounded-lg p-8 shadow-pop will-change-transform sm:p-12"
            style={{ top: `calc(92px + ${i * 14}px)` }}
          >
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-[52ch]">
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="font-display text-[64px] leading-none text-stroke-ink"
                  >
                    {f.n}
                  </span>
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-worn-gold/40 bg-worn-gold-tint text-worn-gold-deep">
                    <f.icon size={20} />
                  </span>
                </div>
                <h3 className="mt-5 font-display text-[clamp(26px,3vw,40px)] leading-tight text-worn-ink">
                  {f.title}
                </h3>
                <p className="mt-4 text-body-l text-worn-ink-soft">{f.copy}</p>
              </div>
              <div className="flex shrink-0 flex-row gap-3 sm:w-[200px] sm:flex-col">
                {f.chip.map((c) => (
                  <div
                    key={c.k}
                    className="rounded-card border border-worn-rule bg-worn-surface/80 px-4 py-3"
                  >
                    <p className="font-mono text-micro uppercase tracking-wider text-worn-muted">
                      {c.k}
                    </p>
                    <p className="mt-1 flex items-center gap-1 font-display text-xl leading-tight text-worn-ink">
                      {c.v}
                      <ArrowDownRight size={14} className="shrink-0 rotate-90 text-worn-gold-deep" />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
