'use client';

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

export function ClosetCTA() {
  const reduced = useReducedMotion();
  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section id="early-access" className="relative scroll-mt-24 overflow-hidden bg-worn-ink text-worn-paper">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 80% at 15% 0%, rgba(200,168,122,0.22), transparent 62%), radial-gradient(50% 70% at 92% 100%, rgba(200,168,122,0.14), transparent 60%)',
        }}
      />
      <div className="section section-py relative text-center">
        <motion.p
          {...a}
          variants={rise}
          custom={0}
          className="mx-auto w-fit ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold"
        >
          Coming after Worn Play
        </motion.p>
        <motion.h2
          {...a}
          variants={rise}
          custom={0.08}
          className="mx-auto mt-6 max-w-[16ch] font-display text-[clamp(40px,6vw,88px)] leading-[1] tracking-tight text-balance"
        >
          Stop shopping. <em className="grad-text font-display">Start wearing.</em>
        </motion.h2>
        <motion.p {...a} variants={rise} custom={0.16} className="mx-auto mt-6 max-w-[56ch] text-body-l text-worn-paper/70">
          Worn Play is in early access now, through TestFlight and Play internal testing. Closet is the
          next chapter, and early access members hear about it first.
        </motion.p>
        <motion.div {...a} variants={rise} custom={0.24} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/#download"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-worn-paper px-7 text-[15px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            Request early access <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill border border-worn-paper/25 bg-worn-paper/10 px-7 text-[15px] font-semibold transition-colors hover:border-worn-gold hover:text-worn-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            See Worn Play
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
