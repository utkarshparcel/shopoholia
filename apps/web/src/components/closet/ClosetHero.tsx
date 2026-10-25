'use client';

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowDown, ArrowRight } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

const TICKER = [
  'NOTHING TO WEAR · 8:02 AM',
  'TAGS STILL ON · TWO SEASONS',
  'GIFT CARD · EXPIRING',
  'WARRANTY · WHERE IS THE RECEIPT',
  'WORN ONCE · THE WEDDING ONE',
  'SIZE L HERE, M THERE',
  'THE PILE TO SELL',
  'WHAT DOES THIS CLOSET COST',
];

export function ClosetHero() {
  const reduced = useReducedMotion();

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-worn-paper pt-[10.5rem] pb-16 sm:pt-40 sm:pb-24"
    >
      {/* Soft gold radial glows */}
      <div
        aria-hidden="true"
        className="animate-glow-pulse pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[860px] max-w-[140vw] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(200,168,122,0.22), transparent)',
        }}
      />
      <div
        aria-hidden="true"
        className="animate-glow-pulse pointer-events-none absolute top-40 -right-40 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(200,168,122,0.14), transparent)',
          animationDelay: '2.4s',
        }}
      />

      <div className="relative section">
        <motion.div
          key="hero-kicker"
          {...a}
          variants={rise}
          custom={0}
          className="flex justify-center"
        >
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">
            Worn Closet · The next chapter · for everything you already bought
          </p>
        </motion.div>

        <motion.h1
          key="hero-title"
          {...a}
          variants={rise}
          custom={0.1}
          className="mx-auto mt-6 max-w-[13ch] text-center font-display text-[clamp(44px,7.5vw,96px)] leading-[0.98] tracking-[-0.02em] text-worn-ink text-balance"
        >
          You already own the mall. <em className="grad-text font-display">Let’s run it.</em>
        </motion.h1>

        <motion.p
          key="hero-sub"
          {...a}
          variants={rise}
          custom={0.2}
          className="mx-auto mt-6 max-w-[62ch] text-center text-body-l text-worn-muted sm:text-lg sm:leading-[1.65]"
        >
          Nothing to wear at 8 AM. Pieces worn once. Gift cards expiring. Receipts
          nowhere. A pile to sell. Worn Closet catalogs what you bought from your
          order emails, plans the week, tracks cost per wear, keeps the money
          paperwork, and helps the pile leave.
        </motion.p>

        <motion.div
          key="hero-ctas"
          {...a}
          variants={rise}
          custom={0.3}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
        >
          <Link href="/#download" className="btn-primary btn-lg w-full sm:w-auto">
            Get the app <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="#today" className="btn-ghost btn-lg w-full sm:w-auto">
            See how it helps <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Link>
        </motion.div>

        <motion.p
          key="hero-note"
          {...a}
          variants={rise}
          custom={0.38}
          className="mt-5 text-center font-mono text-micro uppercase tracking-[0.2em] text-worn-muted"
        >
          Coming after Worn Play · join early access to be first
        </motion.p>

        {/* Floating glass receipts (sample UI) */}
        <motion.div
          key="hero-chip-left"
          {...a}
          variants={rise}
          custom={0.45}
          className="animate-float pointer-events-none absolute left-0 top-[54%] hidden xl:block"
        >
          <div className="glass rounded-xl px-4 py-3">
            <p className="font-mono text-micro uppercase tracking-widest text-worn-muted">Wool coat</p>
            <p className="mt-1 font-display text-xl text-worn-ink">48 wears</p>
            <p className="font-mono text-micro uppercase tracking-widest text-worn-gold-deep mt-0.5">Cost per wear falling ↓</p>
          </div>
        </motion.div>
        <motion.div
          key="hero-chip-right"
          {...a}
          variants={rise}
          custom={0.55}
          className="animate-float pointer-events-none absolute right-0 top-[38%] hidden xl:block"
          style={{ animationDelay: '2.8s' }}
        >
          <div className="glass rounded-xl px-4 py-3">
            <p className="font-mono text-micro uppercase tracking-widest text-worn-muted">Gift card · café</p>
            <p className="mt-1 font-display text-xl text-worn-ink">Expiring this month</p>
            <p className="font-mono text-micro uppercase tracking-widest text-worn-gold-deep mt-0.5">Rescue scheduled</p>
          </div>
        </motion.div>
      </div>

      {/* Mono ticker marquee */}
      <motion.div
        key="hero-ticker"
        {...a}
        variants={rise}
        custom={0.6}
        className="fade-x relative mt-16 border-y border-worn-rule py-4 sm:mt-24"
      >
        <div className="marquee-track gap-10">
          {[0, 1].map(
            (copy: number) => (
              <div
                key={`ticker-copy-${copy}`}
                aria-hidden={copy === 1}
                className="flex shrink-0 gap-10"
              >
                {TICKER.map(
                  (item: string, i2: number) => (
                    <span
                      key={`ticker-${copy}-${i2}`}
                      className="shrink-0 font-mono text-micro uppercase tracking-[0.22em] text-worn-muted"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            ),
          )}
        </div>
      </motion.div>
    </section>
  );
}
