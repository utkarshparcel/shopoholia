'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';
import { GoldParticles } from './GoldParticles';
import { gsap } from '@/lib/gsap';

/* ── Data — real dresses from the scraped catalog (apps/api seed) ── */

const CH = 2; // the dress that flies

const DRESSES = [
  {
    name: 'Yellow floral a-line maxi, 2024 — 0 wears',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/04/021348591258e001/NM-PRC-414-DRS-26-APR-32495-YELLOW(1).webp',
    caption: 'Fits you · Never worn · $118 resale waiting',
    coins: 1049,
  },
  {
    name: 'Black cowl-neck midi — tags still on',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/04152538fdacdf9c/NM-PRC-374-DRS-26-JUN-34296-BLACK(1).webp',
    caption: 'Tag still on · Two marketplaces are bidding',
    coins: 1049,
  },
  {
    name: 'Sage ruched bodycon mini, 2025 — worn once',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/12073053427750de/NM-PRC-455-DRS-26-JUN-34374-SAGE(1).webp',
    caption: 'Wear it 14 days straight · +40 coins',
    coins: 1049,
  },
  {
    name: 'Red one-shoulder ruched dress — never worn',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/05/09102331e3473fe4/NM-IN-56-DRS-24-APR-5058-RED(0).webp',
    caption: 'You paid $240 · You’ve enjoyed $0',
    coins: 450,
  },
  {
    name: 'Pink sequin halter maxi — the wedding one',
    img: 'https://assets.newme.asia/wp-content/uploads/2025/11/2008454511161b6b/NM-PRC-9997-DRS-25-NOV-26970-LIGHTPINK(1).webp',
    caption: 'Fits you · 9 people would buy this today',
    coins: 1649,
  },
  {
    name: 'Off-white striped maxi, 2023 — worn twice',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/03/1715592685b4dd97/NM-PRC-178-DRS-26-MAR-31596-OFFWHITE(1).webp',
    caption: 'Cost per wear · now $5 · was $48',
    coins: 949,
  },
];

const COPY = {
  kicker: 'THE MORNING DROP · 8:02 AM',
  midflight: 'New arrival. Arrived 2019. First flight.',
  landed: 'You already bought this. It finally fits like you meant it.',
  hint: 'Not feeling it? One tap back to the rack',
  photoline: 'The picture is free. The outfit is yours. Every day.',
};

/* ── Mannequin (dress form) — the pre-landing silhouette ──── */

function Mannequin({ className }: { className?: string }) {
  const stroke = 'rgba(250,248,245,0.3)';
  return (
    <svg viewBox="0 0 320 400" className={className} aria-hidden="true">
      <line x1="160" y1="292" x2="160" y2="352" stroke={stroke} strokeWidth="3" />
      <path d="M104 374 Q160 334 216 374" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <circle cx="160" cy="62" r="8" fill={stroke} />
      <path
        d="M134 72 C138 64 182 64 186 72 C194 90 190 106 184 120 C196 142 194 170 184 192 C198 214 204 244 198 290 Q160 304 122 290 C116 244 122 214 136 192 C126 170 124 142 136 120 C130 106 126 90 134 72 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
      />
    </svg>
  );
}

/* ── The Morning Drop — pinned GRWM scroll cinema ─────────── */

export function MorningDrop() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const root = sectionRef.current;
      if (!root) return;
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-card]'));
      const chosen = root.querySelector('[data-chosen]');
      const movie = root.querySelector('[data-movie]');
      const model = root.querySelector('[data-model]');
      const photoline = root.querySelector('[data-photoline]');
      const kicker = root.querySelector('[data-kicker]');
      const cap1 = root.querySelector('[data-cap1]');
      const cap2 = root.querySelector('[data-cap2]');
      const hint = root.querySelector('[data-hint]');

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: movie as HTMLElement,
          start: 'top top',
          end: '+=280%',
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // kicker
      tl.fromTo(kicker, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.05 }, 0);

      // the rack clears — everyone except the chosen one
      cards.forEach((el, i) => {
        if (i === CH || !chosen) return;
        const dir = i < CH ? -1 : 1;
        tl.to(
          el,
          {
            x: () => dir * window.innerWidth * 0.85,
            rotation: dir * 16,
            autoAlpha: 0,
            scale: 0.85,
            duration: 0.26,
            ease: 'power2.in',
          },
          0.06 + Math.abs(i - CH) * 0.02,
        );
      });

      // the chosen one rises
      tl.to(chosen, { scale: 1.55, y: '5vh', rotation: -2, duration: 0.3 }, 0.14);

      // mid-flight caption
      tl.fromTo(cap1, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.12 }, 0.2);
      tl.to(cap1, { autoAlpha: 0, duration: 0.1 }, 0.52);

      // landing — the dress "transfers" onto the real model
      tl.fromTo(model, { autoAlpha: 0, scale: 0.96, y: 20 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.26 }, 0.56);
      tl.to('[data-mannequin]', { autoAlpha: 0, duration: 0.16 }, 0.58);
      tl.to(chosen, { autoAlpha: 0, scale: 1.85, duration: 0.2, ease: 'power1.in' }, 0.62);

      // landed caption + swap hint
      tl.fromTo(cap2, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.14 }, 0.8);
      tl.fromTo(hint, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.08 }, 0.88);
      tl.fromTo(photoline, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.94);

      // hold the final frame
      tl.to({}, { duration: 0.06 });

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });
    return () => mm.revert();
  }, [reduced]);

  /* Channels — driven by scroll on desktop, static on mobile */
  const cinemaCls = reduced
    ? 'hidden'
    : 'hidden relative h-screen items-center justify-center overflow-hidden lg:flex';
  const staticCls = reduced ? 'bg-worn-ink py-20 text-worn-paper' : 'bg-worn-ink py-20 text-worn-paper lg:hidden';

  return (
    <section id="grwm" ref={sectionRef} aria-label="The morning drop — get ready with Worn" className="relative">
      {/* ── Desktop cinema (GSAP-pinned) ── */}
      <div data-movie className={cinemaCls} style={{ backgroundColor: '#0c0b09' }}>
        {/* spotlight + dust */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-[640px] w-[880px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(200,168,122,0.22), transparent)' }}
        />
        <GoldParticles density={40} />

        {/* mannequin stage (pre-landing) */}
        <div data-mannequin className="relative z-10 h-[72vh] w-[320px] max-w-[38vw] will-change-transform">
          <Mannequin className="h-full w-full" />
        </div>

        {/* real model photo (replaces the form as the dress lands) */}
        <div
          data-model
          style={{ opacity: 0 }}
          className="absolute left-1/2 top-[46%] z-10 h-[60vh] max-h-[500px] w-[300px] max-w-[36vw] -translate-x-1/2 -translate-y-1/2 will-change-transform"
        >
          <img
            src="/model-sage.png"
            alt=""
            className="h-full w-full rounded-card object-cover shadow-[0_60px_120px_-20px_rgba(0,0,0,0.7)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-worn-gold/35"
          />
        </div>

        {/* rack of real dresses */}
        <div className="absolute inset-0 z-20 flex items-center justify-center gap-7 pt-[6vh]">
          <div
            aria-hidden="true"
            className="breeze absolute left-0 top-1/3 h-24 w-40 -skew-x-12 opacity-0"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(250,248,245,0.08), transparent)' }}
          />
          {DRESSES.map((d, i) => (
            <figure
              key={d.name}
              data-card
              data-chosen={i === CH ? '' : undefined}
              className="rack-card relative w-[172px] shrink-0 rounded-card bg-worn-paper/95 p-3 pb-5 shadow-pop will-change-transform"
              style={{
                animationDelay: `${i * 0.45}s`,
                animationDuration: `${5 + (i % 3) * 0.8}s`,
                transform: `translateY(${(i % 2 === 0 ? -1 : 1) * (6 + (i % 3) * 7)}px)`,
              }}
            >
              <div className="h-[190px] w-full overflow-hidden rounded-md bg-worn-warm-deep">
                <img src={d.img} alt="" loading={i === CH ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-2 text-center font-mono text-[10px] leading-snug tracking-wide text-worn-ink/70">
                {d.name}
              </figcaption>
              <span className="mt-2 block truncate rounded-pill border border-worn-gold/50 bg-worn-gold-tint px-2.5 py-1 text-center font-mono text-[9px] uppercase tracking-wider text-worn-gold-deep">
                {d.caption}
              </span>
              <span className="mt-1 block text-center font-mono text-[9px] tracking-widest text-worn-muted">
                ◷ {d.coins} coins
              </span>
            </figure>
          ))}
        </div>

        {/* captions */}
        <p
          data-kicker
          style={{ opacity: 0 }}
          className="absolute left-1/2 top-10 z-30 -translate-x-1/2 font-mono text-micro uppercase tracking-[0.3em] text-worn-gold"
        >
          {COPY.kicker}
        </p>
        <p
          data-cap1
          style={{ opacity: 0 }}
          className="absolute bottom-[13%] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap font-display text-2xl italic text-worn-paper/85"
        >
          {COPY.midflight}
        </p>
        <p
          data-cap2
          style={{ opacity: 0 }}
          className="absolute bottom-[12%] left-1/2 z-30 w-full max-w-[720px] -translate-x-1/2 px-6 text-center font-display text-[clamp(24px,3vw,38px)] leading-tight text-worn-paper"
        >
          {COPY.landed}
        </p>
        <p
          data-hint
          style={{ opacity: 0 }}
          className="absolute bottom-[6.5%] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 font-mono text-micro uppercase tracking-[0.22em] text-worn-paper/45"
        >
          <RefreshCcw size={11} />
          {COPY.hint}
        </p>
        <p
          data-photoline
          style={{ opacity: 0 }}
          className="absolute bottom-[3.5%] left-1/2 z-30 w-full -translate-x-1/2 text-center font-mono text-micro uppercase tracking-[0.3em] text-worn-gold/80"
        >
          {COPY.photoline}
        </p>
      </div>

      {/* ── Static / mobile / reduced-motion ── */}
      <div className={staticCls}>
        <div className="section text-center">
          <p className="ornament ml-auto mr-auto w-fit font-mono text-micro uppercase tracking-[0.28em] text-worn-gold">
            {COPY.kicker}
          </p>
        </div>
        {/* snap-scroll rack */}
        <div className="fade-x mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4 lg:justify-center">
          {DRESSES.map((d, i) => (
            <figure
              key={d.name}
              className={`rack-card w-[168px] shrink-0 snap-center rounded-card bg-worn-paper/95 p-3 pb-5 ${
                i === CH ? 'ring-2 ring-worn-gold/70' : ''
              }`}
              style={{
                animationDelay: `${i * 0.45}s`,
                animationDuration: `${5 + (i % 3) * 0.8}s`,
              }}
            >
              <div className="h-[180px] w-full overflow-hidden rounded-md bg-worn-warm-deep">
                <img src={d.img} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-2 text-center font-mono text-[10px] leading-snug tracking-wide text-worn-ink/70">
                {d.name}
              </figcaption>
              <span className="mt-2 block truncate rounded-pill border border-worn-gold/50 bg-worn-gold-tint px-2.5 py-1 text-center font-mono text-[9px] uppercase tracking-wider text-worn-gold-deep">
                {d.caption}
              </span>
              <span className="mt-1 block text-center font-mono text-[9px] tracking-widest text-worn-muted">
                ◷ {d.coins} coins
              </span>
            </figure>
          ))}
        </div>
        <div className="section mt-12 flex flex-col items-center gap-7 text-center">
          <p className="font-display text-2xl italic text-worn-paper/85">{COPY.midflight}</p>
          <div className="h-[420px] w-[300px]">
            <img
              src="/model-sage.png"
              alt="Model wearing a sage ruched mini dress from the wardrobe"
              className="h-full w-full rounded-card object-cover ring-1 ring-worn-gold/35"
            />
          </div>
          <p className="max-w-[30ch] font-display text-[clamp(24px,4vw,34px)] leading-tight text-worn-paper">
            {COPY.landed}
          </p>
          <p className="flex items-center gap-2 font-mono text-micro uppercase tracking-[0.22em] text-worn-paper/45">
            <RefreshCcw size={11} />
            {COPY.hint}
          </p>
          <p className="font-mono text-micro uppercase tracking-[0.3em] text-worn-gold/80">{COPY.photoline}</p>
        </div>
      </div>
    </section>
  );
}
