'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Sparkles, Shirt } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function TwoSides() {
  const reduced = useReducedMotion();
  const reveal = (d: number) =>
    reduced
      ? { initial: { opacity: 1, y: 0 } as const }
      : {
          initial: { opacity: 0, y: 36 } as const,
          whileInView: { opacity: 1, y: 0 } as const,
          viewport: { once: true, margin: '-80px' } as const,
          transition: { duration: 0.9, ease: EASE, delay: d },
        };

  return (
    <section id="two-sides" aria-label="Two sides of Worn" className="relative py-24 sm:py-32">
      <div className="section">
        <motion.p
          {...reveal(0)}
          className="ornament font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep"
        >
          One app · Two chapters
        </motion.p>
        <motion.h2
          {...reveal(0.05)}
          className="mt-6 max-w-[18ch] font-display text-[clamp(38px,5.5vw,76px)] leading-[1.02] tracking-tight text-worn-ink"
        >
          The itch, <em className="grad-text">then the closet.</em>
        </motion.h2>
        <motion.p {...reveal(0.1)} className="mt-6 max-w-[56ch] text-body-l text-worn-ink-soft">
          Worn Play is the shopping app where nothing ships. Worn Closet is what
          comes next for everything you already bought.
        </motion.p>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          {/* Play: in the app today */}
          <motion.div
            {...reveal(0.12)}
            className="group relative overflow-hidden rounded-card border border-worn-rule bg-worn-surface p-6 shadow-pop sm:p-10"
          >
            <span className="inline-flex items-center gap-2 rounded-pill border border-worn-gold/40 bg-worn-gold-tint px-3 py-1 font-mono text-micro uppercase tracking-[0.12em] text-worn-gold-deep sm:tracking-[0.18em]">
              <Sparkles size={12} /> Worn Play · in the app today
            </span>
            <h3 className="mt-6 font-display text-[clamp(28px,3.4vw,44px)] leading-tight text-worn-ink">
              The haul, without the parcel.
            </h3>
            <p className="mt-4 max-w-[46ch] text-body-l text-worn-ink-soft">
              Browse tonight’s edit, try it on your avatar, add it to your haul and
              pay with coins. Pick a delivery speed, wait for the push, then unbox
              the AI renders of you in it. No clothes bill, no parcel, no pile.
            </p>
            <a
              href="#download"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 font-sans text-[15px] font-semibold text-worn-gold-deep"
            >
              Request early access
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </motion.div>

          {/* Closet: the next chapter */}
          <motion.div
            {...reveal(0.18)}
            className="group relative overflow-hidden rounded-card border border-worn-paper/15 bg-worn-ink p-6 text-worn-paper shadow-pop sm:p-10"
          >
            <span className="inline-flex items-center gap-2 rounded-pill border border-worn-gold/40 bg-worn-gold/10 px-3 py-1 font-mono text-micro uppercase tracking-[0.12em] text-worn-gold sm:tracking-[0.18em]">
              <Shirt size={12} /> Worn Closet · the next chapter
            </span>
            <h3 className="mt-6 font-display text-[clamp(28px,3.4vw,44px)] leading-tight">
              Then, the clothes you already bought.
            </h3>
            <p className="mt-4 max-w-[46ch] text-body-l text-worn-paper/70">
              Catalog what you own from your order emails, get the week planned,
              see cost per wear, and find the gift cards, warranties and resale
              money sleeping in your wardrobe.
            </p>
            <a
              href="/closet"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 font-sans text-[15px] font-semibold text-worn-gold"
            >
              Explore Worn Closet
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
