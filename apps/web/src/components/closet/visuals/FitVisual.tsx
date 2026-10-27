'use client';

import { motion } from 'framer-motion';
import { Check, Scissors } from 'lucide-react';
import { Glow, Screen, grow, lift, pop } from './shared';

type Step = { label: string; when: string };

const STEPS: Step[] = [
  { label: 'Dropped at tailor', when: 'Mon' },
  { label: 'Cutting', when: 'Done' },
  { label: 'Stitching', when: 'Now' },
  { label: 'Ready for pickup', when: 'Thu' },
];
const CURRENT = 2;

export function FitVisual() {
  return (
    <div
      role="img"
      aria-label="Sample tailoring tracker: a blouse being taken in at the waist, each step updated by you or your tailor. Dropped at the tailor Monday, cutting done, stitching now, ready for pickup Thursday."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Tailoring, tracked">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-worn-gold-tint">
              <Scissors className="h-[18px] w-[18px] text-worn-gold-deep" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body font-medium text-worn-ink">Blouse · taken in at the waist</span>
              <span className="block text-[12px] text-worn-muted">Alteration · at your tailor</span>
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-worn-rule/70 pt-4">
            <div>
              <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Ready for pickup</p>
              <p className="mt-1 font-display text-[30px] leading-none text-worn-ink sm:text-[34px]">Thursday</p>
            </div>
            <span className="mb-0.5 inline-flex items-center gap-1.5 rounded-pill bg-worn-success/10 px-2.5 py-1 text-[12px] font-medium text-[#2f6b4e]">
              <span className="h-1.5 w-1.5 rounded-full bg-worn-success" aria-hidden="true" />
              On track
            </span>
          </div>

          {/* Parcel-style progress: Mon → Thu */}
          <div className="relative mt-6">
            <div className="absolute left-[12.5%] right-[12.5%] top-[11px] h-0.5 rounded-pill bg-worn-rule" />
            <motion.div
              variants={grow}
              custom={0.4}
              className="absolute left-[12.5%] top-[11px] h-0.5 w-1/2 origin-left rounded-pill bg-worn-gold-deep"
            />
            <ol className="relative grid grid-cols-4">
              {STEPS.map(
                (s: Step, i: number) => {
                  const done = i < CURRENT;
                  const current = i === CURRENT;
                  return (
                    <li key={`fit-step-${i}`} className="flex flex-col items-center px-1 text-center">
                      <motion.span
                        variants={pop}
                        custom={0.35 + i * 0.22}
                        className={`relative flex h-6 w-6 items-center justify-center rounded-full ${
                          done
                            ? 'bg-worn-gold-deep text-white'
                            : current
                              ? 'border-2 border-worn-gold-deep bg-worn-surface'
                              : 'border-2 border-worn-rule bg-worn-surface'
                        }`}
                      >
                        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : null}
                        {current ? (
                          <>
                            <span className="absolute -inset-1 rounded-full bg-worn-gold/40 motion-safe:animate-ping" aria-hidden="true" />
                            <span className="relative h-2 w-2 rounded-full bg-worn-gold-deep" />
                          </>
                        ) : null}
                      </motion.span>
                      {/* Day first so the row stays level when a label wraps */}
                      <motion.span
                        variants={lift}
                        custom={0.5 + i * 0.22}
                        className={`mt-2 font-mono text-micro uppercase tracking-[0.14em] ${
                          current ? 'text-worn-gold-deep' : 'text-worn-muted'
                        }`}
                      >
                        {s.when}
                      </motion.span>
                      <span
                        className={`mt-1 text-[12px] leading-tight ${
                          current ? 'font-semibold text-worn-ink' : done ? 'text-worn-ink-soft' : 'text-worn-muted'
                        }`}
                      >
                        {s.label}
                      </span>
                    </li>
                  );
                },
              )}
            </ol>
          </div>
        </div>
      </Screen>
    </div>
  );
}
