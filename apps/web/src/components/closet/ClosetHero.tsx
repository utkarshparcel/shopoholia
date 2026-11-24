'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Pause, Play } from 'lucide-react';

/* Entrance delay for the CSS-only .hero-rise keyframes (globals.css), as on the Play hero: they run on
   first paint, so the heading is there before hydration, and without JS at all. framer's scroll reveal
   kept it at opacity 0 until both had happened. */
const delay = (s: number) => ({ '--d': `${s.toFixed(2)}s` }) as CSSProperties;

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
  // WCAG 2.2.2: the ticker moves for more than five seconds, so it can be paused (button, hover, focus)
  const [paused, setPaused] = useState(false);

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
        <div
          className="hero-rise flex justify-center"
          style={delay(0)}
        >
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">
            Worn Closet · The next chapter · for everything you already bought
          </p>
        </div>

        <h1
          className="hero-rise mx-auto mt-6 max-w-[13ch] text-center font-display text-[clamp(44px,7.5vw,96px)] leading-[0.98] tracking-[-0.02em] text-worn-ink text-balance"
          style={delay(0.1)}
        >
          You already own the mall. <em className="grad-text font-display">Let’s run it.</em>
        </h1>

        <p
          className="hero-rise mx-auto mt-6 max-w-[62ch] text-center text-body-l text-worn-muted sm:text-lg sm:leading-[1.65]"
          style={delay(0.2)}
        >
          Nothing to wear at 8 AM. Pieces worn once. Gift cards expiring. Receipts
          nowhere. A pile to sell. Worn Closet catalogs what you bought from your
          order emails, plans the week, tracks cost per wear, keeps the money
          paperwork, and helps the pile leave.
        </p>

        <div
          className="hero-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
          style={delay(0.3)}
        >
          <Link href="#early-access" className="btn-primary btn-lg w-full sm:w-auto">
            Request early access <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="#week" className="btn-ghost btn-lg w-full sm:w-auto">
            See how it helps <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <p
          className="hero-rise mt-5 text-center font-mono text-micro uppercase tracking-[0.2em] text-worn-muted"
          style={delay(0.38)}
        >
          Coming after Worn Play · join early access to be first
        </p>

        {/* Floating glass receipts (sample UI) */}
        <div
          className="hero-rise pointer-events-none absolute left-0 top-[54%] hidden xl:block"
          style={delay(0.45)}
        >
          {/* the float on its own box: one element can't run both animations */}
          <div className="animate-float glass rounded-xl px-4 py-3">
            <p className="font-mono text-micro uppercase tracking-widest text-worn-muted">Sample · Wool coat</p>
            <p className="mt-1 font-display text-xl text-worn-ink">48 wears</p>
            <p className="font-mono text-micro uppercase tracking-widest text-worn-gold-deep mt-0.5">Cost per wear falling ↓</p>
          </div>
        </div>
        <div
          className="hero-rise pointer-events-none absolute right-0 top-[38%] hidden xl:block"
          style={delay(0.55)}
        >
          <div className="animate-float glass rounded-xl px-4 py-3" style={{ animationDelay: '2.8s' }}>
            <p className="font-mono text-micro uppercase tracking-widest text-worn-muted">Sample · café gift card</p>
            <p className="mt-1 font-display text-xl text-worn-ink">Expiring this month</p>
            <p className="font-mono text-micro uppercase tracking-widest text-worn-gold-deep mt-0.5">Reminders set</p>
          </div>
        </div>
      </div>

      {/* Mono ticker marquee */}
      <div className="hero-rise relative mt-16 border-y border-worn-rule sm:mt-24" style={delay(0.6)}>
        {/* hovering pauses it (.marquee-paused); the button pauses it for touch and keyboard users */}
        <div className="marquee-paused fade-x py-4 pr-12">
        <div className="marquee-track gap-10" style={paused ? { animationPlayState: 'paused' } : undefined}>
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
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Play the ticker' : 'Pause the ticker'}
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-worn-rule bg-worn-paper text-worn-muted transition-colors hover:text-worn-ink motion-reduce:hidden"
        >
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
