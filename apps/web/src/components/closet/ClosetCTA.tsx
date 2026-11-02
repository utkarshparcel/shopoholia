'use client';

import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { reveal } from '@/lib/motion';
import { ArrowRight, Mail } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site';

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
          {...reveal}
          variants={rise}
          custom={0}
          className="mx-auto w-fit ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold"
        >
          Worn Closet · early access
        </motion.p>
        <motion.h2
          {...reveal}
          variants={rise}
          custom={0.08}
          className="mx-auto mt-6 max-w-[16ch] font-display text-[clamp(40px,6vw,88px)] leading-[1] tracking-tight text-balance"
        >
          Run the closet <em className="grad-text-ink font-display">you already own.</em>
        </motion.h2>
        <motion.p {...reveal} variants={rise} custom={0.16} className="mx-auto mt-6 max-w-[56ch] text-body-l text-worn-paper/70">
          Worn Closet is the next chapter of Worn. Join the Closet list and you’ll hear first when it
          opens. Want the haul in the meantime? Worn Play is in early access now on iOS and Android.
        </motion.p>
        <motion.div {...reveal} variants={rise} custom={0.24} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Worn%20Closet%20early%20access`}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-worn-paper px-7 text-[15px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            <Mail className="h-4 w-4" aria-hidden="true" /> Join the Closet list
          </a>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill border border-worn-paper/25 bg-worn-paper/10 px-7 text-[15px] font-semibold transition-colors hover:border-worn-gold hover:text-worn-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            See Worn Play <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
