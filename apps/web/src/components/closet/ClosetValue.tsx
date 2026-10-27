'use client';

import { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useAnimationControls,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { Plus, Repeat, RotateCcw, Sunrise, TrendingDown, Umbrella } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

const START = 2600;
const MAX = 999999;
const GOAL = 100;

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const TILES = [
  {
    icon: Sunrise,
    title: 'Mornings, decided',
    copy: 'The outfit is picked before you are up. No standing at the wardrobe with nothing to wear.',
  },
  {
    icon: TrendingDown,
    title: 'Cost per wear, falling',
    copy: 'Every wear counts against what you paid, so the pricey pieces start earning their place.',
  },
  {
    icon: Umbrella,
    title: 'A backup when the day changes',
    copy: 'Bad hair, bloated, not waxed or a sudden date: the backup is already in the top drawer.',
  },
  {
    icon: Repeat,
    title: 'Forgotten pieces, worn again',
    copy: 'Worn brings back what has been sitting at the back, before it turns into a donation pile.',
  },
];

/** Smaller with every wear, quickly at first, then settling. */
const tagScale = (wears: number) => 0.58 + 0.42 * Math.pow(wears, -0.38);

function PriceTag({ price, wears, reduced }: { price: number; wears: number; reduced: boolean }) {
  const perWear = price / wears;
  const value = useMotionValue(perWear);
  const [shown, setShown] = useState(perWear);
  const swing = useAnimationControls();
  const firstWear = useRef(wears);

  useMotionValueEvent(value, 'change', (v) => setShown(v));

  useEffect(() => {
    const c = animate(value, perWear, reduced ? { duration: 0 } : { duration: 0.7, ease: EASE });
    return () => c.stop();
  }, [perWear, reduced, value]);

  useEffect(() => {
    if (reduced || wears === firstWear.current) return;
    swing.start({ rotate: [0, -5, 3.5, -1.6, 0.6, 0], transition: { duration: 1.1, ease: 'easeOut' } });
  }, [wears, reduced, swing]);

  return (
    <div className="relative mx-auto h-[380px] w-[260px] sm:h-[420px] sm:w-[290px]" aria-hidden="true">
      {/* the hook and the string */}
      <span className="absolute left-1/2 top-0 h-[14px] w-[14px] -translate-x-1/2 rounded-full border-[3px] border-[#b08a52] bg-transparent" />
      <motion.div className="absolute inset-x-0 top-[10px] origin-top" animate={swing}>
        <svg className="mx-auto block" width="40" height="56" viewBox="0 0 40 56" fill="none">
          <path d="M20 0 C 12 18, 10 34, 16 54 M20 0 C 28 18, 30 34, 24 54" stroke="#b9a07a" strokeWidth="1.4" />
        </svg>
        <motion.div
          className="relative mx-auto -mt-[6px] w-[228px] origin-top sm:w-[252px]"
          initial={false}
          animate={{ scale: tagScale(wears) }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 16 }}
        >
          <div
            className="relative px-6 pb-6 pt-12 text-worn-ink shadow-[0_18px_40px_rgba(60,40,20,0.18)]"
            style={{
              clipPath: 'polygon(22% 0, 78% 0, 100% 13%, 100% 100%, 0 100%, 0 13%)',
              background: 'linear-gradient(170deg, #f6ead4 0%, #efdfc2 100%)',
            }}
          >
            {/* the punched hole */}
            <span className="absolute left-1/2 top-[14px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] border-[#d9c09a] bg-worn-paper shadow-[inset_0_1px_2px_rgba(60,40,20,0.35)]" />
            <p className="text-center font-mono text-micro uppercase tracking-[0.22em] text-worn-ink-soft">Sage ruched mini</p>
            <p className="mt-5 text-center font-mono text-micro uppercase tracking-[0.22em] text-worn-gold-deep">Cost per wear</p>
            <p className="mt-1 text-center font-display text-[52px] leading-none tracking-[-0.02em] tabular-nums sm:text-[58px]">
              {rupees(shown)}
            </p>
            <div className="mt-6 border-t border-dashed border-[#cdb48c] pt-4">
              <div className="flex justify-between font-mono text-[12px] uppercase tracking-[0.12em] text-worn-ink-soft">
                <span>Paid {rupees(price)}</span>
                <span>Worn {wears}×</span>
              </div>
            </div>
            {/* faux barcode */}
            <div className="mt-5 flex h-[26px] items-stretch justify-center gap-[2px] opacity-70">
              {[2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1].map((w, i) => (
                <span key={i} className="bg-worn-ink-soft" style={{ width: w }} />
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function ClosetValue() {
  const reduced = !!useReducedMotion();
  const [wears, setWears] = useState(1);
  const [draft, setDraft] = useState(String(START));
  const [bump, setBump] = useState(0);
  const touched = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.5 });

  const parsed = parseInt(draft, 10);
  const price = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX) : START;
  const goalWears = Math.max(1, Math.ceil(price / GOAL));
  const progress = Math.min(1, wears / goalWears);

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  const wear = () => {
    setWears((w) => Math.min(w + 1, 999));
    setBump((b) => b + 1);
  };

  // Untouched, it logs a few wears on its own so the drop is visible.
  useEffect(() => {
    if (!inView || touched.current || reduced || wears >= 8) return;
    const t = setTimeout(() => {
      if (!touched.current) wear();
    }, wears === 1 ? 900 : 650);
    return () => clearTimeout(t);
  }, [inView, wears, reduced]);

  return (
    <section id="value" className="relative scroll-mt-24 overflow-hidden">
      <div className="section section-py">
        <motion.div {...a} variants={rise} custom={0}>
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">What it adds up to</p>
          <h2 className="mt-6 max-w-[20ch] font-display text-[clamp(32px,4.5vw,56px)] leading-[1.04] tracking-[-0.015em] text-worn-ink text-balance">
            Every wear makes it <em className="grad-text font-display">cheaper.</em>
          </h2>
          <p className="mt-4 max-w-[58ch] text-body-l text-worn-muted">
            A {rupees(START)} dress worn once cost {rupees(START)}. Worn {Math.ceil(START / GOAL)} times, it cost{' '}
            {rupees(GOAL)} a wear. Worn keeps the count, so what you already paid for starts to feel worth it.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
          {/* The tag and its controls */}
          <motion.div
            {...a}
            variants={rise}
            custom={0.1}
            ref={stageRef}
            className="rounded-[28px] border border-worn-rule bg-[#f7f1e7] px-5 pb-6 pt-8 sm:px-8"
          >
            <PriceTag price={price} wears={wears} reduced={reduced} />
            <p className="sr-only" aria-live="polite">
              {`Worn ${wears === 1 ? 'once' : `${wears} times`}: ${rupees(price / wears)} a wear.`}
            </p>

            <div className="mt-2 flex flex-wrap items-end justify-center gap-3">
              <label className="flex flex-col gap-1 text-left">
                <span className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">What you paid</span>
                <span className="flex min-h-[48px] items-center rounded-[14px] border border-worn-rule bg-worn-surface px-3 focus-within:border-worn-gold">
                  <span className="text-body-l text-worn-muted">₹</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft}
                    onChange={(e) => {
                      touched.current = true;
                      setDraft(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    className="w-[92px] bg-transparent px-1.5 text-body-l font-semibold text-worn-ink outline-none"
                    aria-label="What you paid, in rupees"
                  />
                </span>
              </label>
              <motion.button
                type="button"
                onClick={() => {
                  touched.current = true;
                  wear();
                }}
                whileTap={reduced ? undefined : { scale: 0.96 }}
                className="relative inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-worn-ink px-6 text-[15px] font-semibold text-worn-paper transition-colors hover:bg-worn-ink-soft"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Wore it
                {bump > 0 && !reduced ? (
                  <motion.span
                    key={bump}
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-2 right-3 font-mono text-[12px] font-semibold text-worn-gold-deep"
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -26 }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  >
                    +1 wear
                  </motion.span>
                ) : null}
              </motion.button>
              {wears > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    touched.current = true;
                    setWears(1);
                  }}
                  className="inline-flex min-h-[48px] items-center gap-1.5 rounded-pill px-3 text-caption font-semibold text-worn-muted transition-colors hover:text-worn-ink"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Start over
                </button>
              ) : null}
            </div>

            <div className="mx-auto mt-6 max-w-[360px]">
              <div className="flex justify-between font-mono text-[12px] text-worn-muted">
                <span>{price <= GOAL ? `Already under ${rupees(GOAL)} a wear` : `${rupees(GOAL)} a wear at ${goalWears} wears`}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-2 h-[6px] overflow-hidden rounded-pill bg-worn-rule">
                <motion.div
                  className="h-full rounded-pill bg-gradient-to-r from-worn-gold to-worn-gold-deep"
                  initial={false}
                  animate={{ width: `${progress * 100}%` }}
                  transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE }}
                />
              </div>
              <p className="mt-3 text-center font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Sample piece</p>
            </div>
          </motion.div>

          {/* What Worn adds */}
          <div className="grid gap-4 sm:grid-cols-2">
            {TILES.map((t, i) => (
              <motion.div
                key={t.title}
                {...a}
                variants={rise}
                custom={0.15 + i * 0.08}
                className="rounded-[22px] border border-worn-rule bg-worn-surface p-6 shadow-card"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-worn-gold-tint text-worn-gold-deep">
                  <t.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-display-m text-worn-ink">{t.title}</h3>
                <p className="mt-2 text-body text-worn-muted">{t.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
