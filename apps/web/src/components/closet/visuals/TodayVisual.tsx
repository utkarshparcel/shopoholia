'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { CalendarClock, ThermometerSun, WashingMachine } from 'lucide-react';
import { AppMark, Glow, SampleTag, Thumb, lift } from './shared';

type Context = { icon: LucideIcon; text: string };

const CONTEXT: Context[] = [
  { icon: ThermometerSun, text: '31°' },
  { icon: CalendarClock, text: 'Lunch at 1' },
  { icon: WashingMachine, text: 'Navy tee in the wash' },
];

/* One backup outfit per kind of morning that goes sideways */
const BACKUPS = [
  { label: 'Bad hair day', img: '/closet/piece-blackknit.webp' },
  { label: 'Bloated', img: '/closet/piece-linen.webp' },
  { label: 'Not waxed', img: '/closet/piece-tee.webp' },
  { label: 'Party or date', img: '/closet/piece-slip.webp' },
];

export function TodayVisual() {
  return (
    <div
      role="img"
      aria-label="Sample notification: this morning’s pick is a sage ruched mini with tan wedges, chosen for 31°, a 1 PM lunch and a navy tee in the wash. Four backups are packed for the week."
      className="relative isolate pb-2.5"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-12" />

      {/* The next notification in the stack, peeking out underneath */}
      <div
        aria-hidden="true"
        className="absolute inset-x-5 bottom-0 -z-10 h-10 rounded-2xl border border-white/80 bg-white/75 shadow-card"
      />

      <div className="glass overflow-hidden rounded-2xl shadow-pop">
        {/* Notification */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <AppMark />
            <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Worn · Today</p>
            <p className="ml-auto font-mono text-micro text-worn-muted">7:45 am</p>
            <SampleTag />
          </div>

          <div className="mt-4 flex gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-micro uppercase tracking-[0.2em] text-worn-gold-deep">This morning</p>
              <p className="mt-1.5 font-display text-[22px] leading-[1.12] text-worn-ink text-balance sm:text-[26px]">
                Sage ruched mini + tan wedges
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {CONTEXT.map(
                  (c: Context, i: number) => {
                    const Icon = c.icon;
                    return (
                      <motion.li
                        key={`today-ctx-${i}`}
                        variants={lift}
                        custom={0.35 + i * 0.08}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-worn-warm px-2.5 py-1 text-[12px] leading-none text-worn-ink-soft"
                      >
                        <Icon className="h-3.5 w-3.5 text-worn-gold-deep" aria-hidden="true" />
                        {c.text}
                      </motion.li>
                    );
                  },
                )}
              </ul>
            </div>
            <Thumb
              src="/renders/sage-mirror.webp"
              focus="50% 62%"
              className="h-[116px] w-[84px] rounded-xl sm:h-[136px] sm:w-[100px]"
            />
          </div>
        </div>

        {/* Backups for the week */}
        <div className="border-t border-worn-rule/70 bg-worn-paper/70 px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">
            Backups packed this week
          </p>
          <ul className="mt-2.5 grid grid-cols-2 gap-1.5 sm:gap-2">
            {BACKUPS.map(
              (b: { label: string; img: string }, i: number) => (
                <motion.li
                  key={`today-backup-${i}`}
                  variants={lift}
                  custom={0.55 + i * 0.07}
                  className="flex min-w-0 items-center gap-2 rounded-pill border border-worn-rule bg-worn-surface py-1 pl-1 pr-3"
                >
                  <Thumb src={b.img} focus="50% 33%" zoom={2} className="h-7 w-7 rounded-full" />
                  <span className="truncate text-[12px] font-medium text-worn-ink-soft">{b.label}</span>
                </motion.li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
