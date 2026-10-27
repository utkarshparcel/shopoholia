'use client';

import { motion } from 'framer-motion';
import { CirclePause, Landmark, ShoppingBag } from 'lucide-react';
import { AppMark, Glow, SampleTag, Thumb, grow, lift } from './shared';

/* Pieces already at home that do the same job as the one in the cart */
const SIMILAR = ['/renders/red-studio.webp', '/renders/sage-studio.webp', '/renders/black-studio.webp'];

const SPENT = 5200;
const LINE = 6000;

export function AccountantVisual() {
  return (
    <div
      role="img"
      aria-label="Sample budget check: you share a product before you buy, and a sheet says you’re ₹800 from your ₹6,000 line this month, shows 3 similar pieces at home, and offers Wear one of these or Buy anyway. An EMI of ₹1,250 is due Friday."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      {/* The checkout it paused, dimmed behind the sheet */}
      <div
        aria-hidden="true"
        className="mx-5 hidden overflow-hidden rounded-t-2xl border border-b-0 border-worn-rule bg-worn-surface/80 px-4 pb-8 pt-3 opacity-70 sm:block"
      >
        <div className="flex items-center gap-2">
          <AppMark />
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Shared to Worn</p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-worn-warm">
            <ShoppingBag className="h-4 w-4 text-worn-muted" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-caption text-worn-ink-soft">Party mini · Wine · M</span>
          <span className="text-caption font-medium text-worn-ink-soft">₹2,400</span>
        </div>
      </div>

      {/* Soft gate sheet */}
      <div className="relative rounded-2xl border border-worn-rule bg-worn-surface p-4 shadow-pop sm:-mt-5 sm:p-5">
        <span aria-hidden="true" className="mx-auto mb-3 hidden h-1 w-9 rounded-pill bg-worn-rule sm:block" />
        <div className="flex items-center gap-2">
          <CirclePause className="h-4 w-4 text-worn-gold-deep" aria-hidden="true" />
          <p className="min-w-0 flex-1 font-mono text-micro uppercase tracking-[0.18em] text-worn-gold-deep">
            Before you buy
          </p>
          <SampleTag />
        </div>

        <p className="mt-3 font-display text-[22px] leading-[1.15] text-worn-ink text-balance sm:text-[25px]">
          You’re ₹800 from your ₹6,000 line this month.
        </p>

        {/* Month so far against the line */}
        <div className="mt-4 h-2 overflow-hidden rounded-pill bg-worn-warm">
          <motion.div
            variants={grow}
            custom={0.35}
            className="h-full origin-left rounded-pill bg-gradient-to-r from-worn-gold to-worn-gold-deep"
            style={{ width: `${(SPENT / LINE) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-micro uppercase tracking-[0.16em] text-worn-muted">₹5,200 spent</p>
          <motion.p
            variants={lift}
            custom={0.6}
            className="inline-flex items-center gap-1.5 rounded-pill bg-worn-gold-tint px-2.5 py-1 text-[12px] font-medium text-worn-gold-deep"
          >
            <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
            EMI due Fri · ₹1,250
          </motion.p>
        </div>

        <motion.div
          variants={lift}
          custom={0.5}
          className="mt-4 flex items-center justify-between gap-3 border-t border-worn-rule/70 pt-4"
        >
          <p className="text-caption font-medium text-worn-ink">3 similar at home</p>
          <span className="flex gap-1.5">
            {SIMILAR.map(
              (src: string, i: number) => (
                <Thumb
                  key={`accountant-similar-${i}`}
                  src={src}
                  focus="50% 34%"
                  zoom={1.8}
                  className="h-10 w-10 rounded-lg"
                />
              ),
            )}
          </span>
        </motion.div>

        <motion.div variants={lift} custom={0.65} className="mt-3.5 flex gap-2">
          <span className="flex flex-1 items-center justify-center rounded-pill bg-worn-ink px-4 py-2.5 text-caption font-semibold text-worn-paper">
            Wear one of these
          </span>
          <span className="flex items-center justify-center rounded-pill border border-worn-rule px-4 py-2.5 text-caption font-semibold text-worn-ink-soft">
            Buy anyway
          </span>
        </motion.div>
      </div>
    </div>
  );
}
