'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { ArrowRight, Heart } from 'lucide-react';
import { Magnetic } from './Magnetic';
import { GoldParticles } from './GoldParticles';
import { gsap } from '@/lib/gsap';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const WORDS = ['Stop', 'shopping.', 'Start', 'wearing.'];

/* entrance delay for the CSS-only .hero-rise / .hero-word keyframes (globals.css):
   they run on first paint, so the headline never waits for hydration */
const delay = (s: number) => ({ '--d': `${s.toFixed(2)}s` }) as CSSProperties;

/* Real catalog pieces (apps/api seed — scraped catalog) */
const FEED = [
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/12073053427750de/NM-PRC-455-DRS-26-JUN-34374-SAGE(1).webp',
    title: 'Sage ruched bodycon mini dress',
    coins: '1,049',
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/05/09102331e3473fe4/NM-IN-56-DRS-24-APR-5058-RED(0).webp',
    title: 'Red one shoulder ruched dress',
    coins: '450',
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/04/021348591258e001/NM-PRC-414-DRS-26-APR-32495-YELLOW(1).webp',
    title: 'Yellow floral a-line maxi dress',
    coins: '1,049',
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/03/1715592685b4dd97/NM-PRC-178-DRS-26-MAR-31596-OFFWHITE(1).webp',
    title: 'Off white striped maxi dress',
    coins: '949',
  },
];

const CHIPS = ['All', 'Dresses', 'Tops', 'Co-ords', 'Bottoms'];
const NAV = [
  ['▦', 'Feed'],
  ['◈', 'Lookbook'],
  ['○', 'Profile'],
];

const TRUST = ['Coins, never cash', 'AI try-on', 'Timed delivery', 'The reveal'];

function Coin() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: 'radial-gradient(circle at 35% 32%, #ecd6ac, #c8a87a 55%, #9c7a4e)' }}
    />
  );
}

/* ── Feed screen mockup (light, matches the app) ─────────── */

function FeedScreen({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative h-[620px] w-full overflow-hidden bg-worn-paper font-sans text-worn-ink">
      {/* status bar */}
      <div className="flex items-center justify-between px-5 pt-4 font-mono text-[9px] tracking-widest text-worn-muted">
        <span>9:41</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-worn-gold" />
          <span className="inline-block h-2 w-6 rounded-full border border-worn-ink/30" />
        </span>
      </div>

      {/* header */}
      <div className="mt-3 flex items-end justify-between px-5">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-worn-muted">Curated for you</p>
          <p className="mt-1 font-display text-[22px] leading-none">Today&apos;s edit</p>
        </div>
        <span className="font-display text-[11px] tracking-[0.3em] text-worn-gold">WORN</span>
      </div>

      {/* category chips */}
      <div className="mt-3 flex gap-1.5 px-5">
        {CHIPS.map((c, i) => (
          <span
            key={c}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${
              i === 0 ? 'bg-worn-ink text-worn-paper' : 'border border-worn-rule bg-worn-surface text-worn-ink-soft'
            }`}
          >
            {c}
          </span>
        ))}
      </div>

      {/* listing grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 px-4">
        {FEED.map((f, i) => (
          <div key={f.title} className="overflow-hidden rounded-xl border border-worn-rule bg-worn-surface shadow-card">
            <div className="relative aspect-[3/4] overflow-hidden bg-worn-warm">
              <img
                src={f.img}
                alt=""
                loading={i < 2 ? 'eager' : 'lazy'}
                decoding="async"
                className="h-full w-full object-cover"
              />
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-worn-surface/90 text-worn-ink">
                <Heart size={10} strokeWidth={2.2} />
              </span>
            </div>
            <div className="p-2">
              <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-worn-muted">NEWME</p>
              <p className="mt-0.5 truncate text-[10px] leading-tight">{f.title}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] font-semibold">
                  <Coin /> {f.coins} coins
                </span>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-worn-ink text-[13px] leading-none text-worn-paper">
                  +
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* toast */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.9, duration: 0.6, ease: EASE }}
        className="absolute bottom-[70px] left-3.5 flex items-center gap-1.5 rounded-full bg-worn-ink px-3 py-1.5 text-[9px] font-semibold text-worn-paper shadow-pop"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-worn-gold" />
        Added to haul
      </motion.div>

      {/* floating haul button */}
      <div className="absolute bottom-[66px] right-3.5 flex items-center gap-2 rounded-full bg-worn-ink py-2 pl-3.5 pr-2 text-[10px] font-semibold text-worn-paper shadow-pop">
        Haul
        <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-worn-gold px-1 font-mono text-[8px] text-worn-ink">
          2
        </span>
      </div>

      {/* bottom nav */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-worn-rule bg-worn-paper/95 px-4 pb-4 pt-2 backdrop-blur">
        {NAV.map(([glyph, label], i) => (
          <span
            key={label}
            className={`flex flex-col items-center gap-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${
              i === 0 ? 'text-worn-gold-deep' : 'text-worn-muted'
            }`}
          >
            <span className={`text-[13px] leading-none ${i === 0 ? 'text-worn-gold' : ''}`}>{glyph}</span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Hero (Play-centric) ──────────────────────────────────── */

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [tiltOK, setTiltOK] = useState(false);

  // mouse tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotX = useSpring(my, { stiffness: 130, damping: 18, mass: 0.5 });
  const rotY = useSpring(mx, { stiffness: 130, damping: 18, mass: 0.5 });

  useEffect(() => {
    if (reduced) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setTiltOK(mq.matches);
    const upd = () => setTiltOK(mq.matches);
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, [reduced]);

  // scroll-out parallax
  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      gsap.to(contentRef.current, {
        y: -120,
        opacity: 0.1,
        ease: 'none',
        scrollTrigger: { trigger: sectionRef.current, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to(phoneRef.current, {
        y: 150,
        rotate: 3,
        ease: 'none',
        scrollTrigger: { trigger: sectionRef.current, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [reduced]);

  const onMove = (e: React.MouseEvent) => {
    if (!tiltOK) return;
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    mx.set(nx * 7);
    my.set(-ny * 6);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section
      ref={sectionRef}
      id="hero"
      aria-label="Stop shopping. Start wearing."
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pb-20 pt-32 sm:pt-36"
    >
      {/* ambient gold glows */}
      <div
        aria-hidden="true"
        className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(200,168,122,0.28), transparent)' }}
      />
      <div
        aria-hidden="true"
        className="animate-glow-pulse absolute bottom-0 right-[8%] h-[420px] w-[420px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(156,122,78,0.22), transparent)' }}
      />
      <GoldParticles density={64} />

      <div ref={contentRef} className="relative z-10 section">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Copy */}
          <div>
            <p
              className="hero-rise ornament font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep"
              style={delay(0)}
            >
              Worn Play · The haul without the parcel
            </p>

            {/* split-text headline */}
            <h1 className="mt-6 font-display leading-[0.98] tracking-tight text-worn-ink">
              <span className="sr-only">Stop shopping. Start wearing.</span>
              <span aria-hidden="true" className="block">
                {WORDS.map((w, i) => (
                  <span
                    key={w}
                    className="inline-block overflow-hidden pb-[0.12em] align-bottom"
                  >
                    <span
                      className={`hero-word inline-block will-change-transform ${
                        i >= 2 ? 'grad-text italic pr-[0.06em]' : ''
                      }`}
                      style={{
                        ...delay(0.25 + i * 0.09),
                        fontSize: 'clamp(40px, 6.2vw, 86px)',
                        marginRight: i < WORDS.length - 1 ? '0.22em' : 0,
                      }}
                    >
                      {w}
                    </span>
                  </span>
                ))}
              </span>
            </h1>

            <p className="hero-rise mt-7 max-w-[52ch] text-body-l text-worn-ink-soft" style={delay(0.55)}>
              Browse real pieces and try them on your AI avatar. Haul them with
              coins, pick a delivery speed and wait for it like it is real. Then
              unbox photos of you wearing them. All of the buying high. None of
              the parcel, the bill, or the pile of clothes you never wear.
            </p>

            {/* CTAs */}
            <div className="hero-rise mt-9 flex flex-wrap items-center gap-4" style={delay(0.7)}>
              <Magnetic strength={0.3}>
                <a href="#download" className="btn btn-primary px-8 py-4 text-[15px] shadow-pop">
                  Get Worn free
                  <ArrowRight size={17} strokeWidth={2.2} />
                </a>
              </Magnetic>
              <Magnetic strength={0.25}>
                <a
                  href="#grwm"
                  className="group inline-flex items-center gap-2.5 rounded-full border border-worn-rule bg-worn-surface/70 px-6 py-4 font-sans text-[15px] font-semibold text-worn-ink backdrop-blur transition-colors hover:border-worn-gold"
                >
                  See the drop
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-worn-gold-tint text-worn-gold-deep transition-transform duration-300 group-hover:translate-x-0.5">
                    <ArrowRight size={13} />
                  </span>
                </a>
              </Magnetic>
            </div>

            {/* trust chips */}
            <ul
              className="hero-rise mt-9 flex flex-wrap gap-x-6 gap-y-2 font-mono text-micro uppercase tracking-[0.14em] text-worn-muted"
              style={delay(0.85)}
            >
              {TRUST.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-worn-gold" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Phone */}
          <div className="relative mx-auto hidden max-w-[340px] sm:block" aria-hidden="true">
            {/* push notification card */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 40, rotate: -10 }}
              animate={{ opacity: 1, y: 0, rotate: -7 }}
              transition={{ delay: 1.05, duration: 1, ease: EASE }}
              className="glass absolute -left-10 bottom-36 z-20 w-56 rounded-card p-3.5 shadow-pop sm:-left-16"
            >
              <p className="flex items-center justify-between font-mono text-micro uppercase tracking-wider text-worn-muted">
                <span className="font-display text-[11px] tracking-[0.3em] text-worn-gold">WORN</span>
                <span>· now</span>
              </p>
              <p className="mt-1.5 font-display text-lg leading-tight text-worn-ink">Your haul is here</p>
              <p className="mt-0.5 text-caption text-worn-ink-soft">Tap to open your cinematic reveal.</p>
            </motion.div>

            {/* phone */}
            <div ref={phoneRef} className="relative z-10 will-change-transform">
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 80, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.55, duration: 1.15, ease: EASE }}
                style={{
                  rotateX: tiltOK ? rotX : 0,
                  rotateY: tiltOK ? rotY : 0,
                  transformPerspective: 1100,
                }}
                className="animate-float relative rounded-[44px] border border-worn-gold/25 bg-worn-ink p-2.5 shadow-[0_50px_100px_-20px_rgba(15,14,12,0.35)]"
              >
                <div className="overflow-hidden rounded-[36px] border border-black/40">
                  <FeedScreen reduced={!!reduced} />
                </div>
                {/* side button */}
                <div className="absolute -right-[3px] top-24 h-14 w-[3px] rounded-full bg-worn-gold/50" />
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* scroll cue */}
      <div
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="hero-rise flex flex-col items-center gap-2" style={delay(1.3)}>
          <span className="font-mono text-micro uppercase tracking-[0.3em] text-worn-muted">Scroll</span>
          <span className="relative block h-10 w-px overflow-hidden bg-worn-rule">
            <motion.span
              className="absolute inset-x-0 top-0 h-4 bg-worn-gold-deep"
              animate={reduced ? undefined : { y: [-16, 40] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </span>
        </div>
      </div>
    </section>
  );
}
