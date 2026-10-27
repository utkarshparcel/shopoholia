'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ChevronRight } from 'lucide-react';
import { Glow, Screen, Thumb, draw, lift, pop } from './shared';

/* Cost per wear of a ₹2,600 piece, wears 4 to 13: ₹650 … ₹217, ₹200 */
const CPW = Array.from({ length: 10 }, (_: unknown, i: number) => 2600 / (i + 4));
const W = 200;
const H = 44;
const PAD = 5;
const POINTS = CPW.map(
  (v: number, i: number): [number, number] => [
    PAD + (i / (CPW.length - 1)) * (W - PAD * 2),
    PAD + ((CPW[0] - v) / (CPW[0] - CPW[CPW.length - 1])) * (H - PAD * 2),
  ],
);
const LINE = POINTS.map(
  (p: [number, number], i: number) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`,
).join(' ');
const AREA = `${LINE} L${W - PAD} ${H} L${PAD} ${H} Z`;
const LAST = POINTS[POINTS.length - 1];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WORN = 5; // Monday to Friday logged; Saturday is today

function Coin() {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-sm"
      style={{ background: 'radial-gradient(circle at 32% 30%, #f6e7c8, #c8a87a 58%, #9c7a4e)' }}
    >
      <span className="h-3 w-3 rounded-full border border-[#806440]/45" />
    </span>
  );
}

export function WorthVisual() {
  return (
    <div
      role="img"
      aria-label="Sample piece card: a ₹2,600 sage ruched mini worn 13 times, so its cost per wear has fallen from ₹217 to ₹200; last worn 9 days ago. A nudge flags a yellow midi not worn in 60 days, and a weekly wear streak pays coins."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Wear & Worth">
        <div className="flex gap-4 p-4 sm:p-5">
          <Thumb
            src="/renders/sage-studio.webp"
            focus="50% 34%"
            zoom={1.35}
            className="h-[124px] w-[88px] rounded-xl sm:h-[150px] sm:w-[108px]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-worn-ink">Sage ruched mini</p>
            <p className="text-[12px] text-worn-muted">₹2,600 · last worn 9 days ago</p>

            <div className="mt-3 flex items-end gap-5">
              <div>
                <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Worn</p>
                <p className="mt-1 font-display text-[30px] leading-none text-worn-ink sm:text-[36px]">13×</p>
              </div>
              <div>
                <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Per wear</p>
                <p className="mt-1 font-display text-[30px] leading-none text-worn-ink sm:text-[36px]">₹200</p>
              </div>
            </div>

            {/* Cost per wear, falling; the caption sits in the empty space above the curve */}
            <div className="relative mt-3">
              <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
                <defs>
                  <linearGradient id="worth-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8a87a" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#c8a87a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <motion.path d={AREA} fill="url(#worth-area)" variants={lift} custom={1.1} />
                <motion.path
                  d={LINE}
                  fill="none"
                  stroke="#806440"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={draw}
                  custom={0.45}
                />
                <motion.circle
                  cx={LAST[0]}
                  cy={LAST[1]}
                  r="3.5"
                  fill="#806440"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  variants={pop}
                  custom={1.55}
                />
              </svg>
              <motion.p
                variants={lift}
                custom={1.25}
                className="absolute right-0 top-0 inline-flex items-center gap-1 text-[12px] font-medium leading-none text-worn-success"
              >
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                Down from ₹217 at 12 wears
              </motion.p>
            </div>
          </div>
        </div>

        {/* Wear streak; on phones the coin line moves up beside the label to keep the card short */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-worn-rule/70 bg-worn-paper/70 px-4 pb-6 pt-3 sm:items-end sm:px-5 sm:pt-3.5">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">
            Wear streak<span className="hidden sm:inline"> · this week</span>
          </p>
          <p className="col-start-2 flex items-center gap-2 text-[12px] font-medium text-worn-ink-soft sm:row-start-2 sm:pb-0.5">
            <Coin />
            Streaks pay coins
          </p>
          <ul className="col-span-2 row-start-2 flex gap-1.5 sm:col-span-1 sm:col-start-1">
            {DAYS.map(
              (d: string, i: number) => (
                <motion.li
                  key={`worth-day-${i}`}
                  variants={pop}
                  custom={0.6 + i * 0.06}
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-micro ${
                    i < WORN
                      ? 'bg-worn-gold text-worn-ink'
                      : i === WORN
                        ? 'border border-dashed border-worn-gold-deep text-worn-gold-deep'
                        : 'border border-worn-rule text-worn-muted'
                  }`}
                >
                  {d}
                </motion.li>
              ),
            )}
          </ul>
        </div>
      </Screen>

      {/* Nudge for a piece that has gone quiet, stacked under the card */}
      <motion.div
        variants={lift}
        custom={0.85}
        className="glass relative z-10 -mt-3 ml-6 mr-1 flex items-center gap-3 rounded-2xl p-2.5 pr-3.5 shadow-pop sm:ml-auto sm:mr-[-12px] sm:w-[300px]"
      >
        <Thumb src="/renders/yellow-studio.webp" focus="50% 34%" zoom={1.6} className="h-11 w-11 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-micro uppercase tracking-[0.16em] text-worn-gold-deep">
            Not worn in 60 days
          </span>
          <span className="block truncate text-caption font-medium text-worn-ink">Yellow jacquard midi</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-worn-muted" aria-hidden="true" />
      </motion.div>
    </div>
  );
}
