'use client';

import { useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { GoldParticles } from './GoldParticles';
import { Magnetic } from './Magnetic';
import { WaitlistForm } from './WaitlistForm';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function AppleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 20.5V3.5c0-.6.34-1.1.84-1.35L13.5 12 3.84 21.85c-.5-.25-.84-.75-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.68.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
    </svg>
  );
}

export function DownloadCTA() {
  const sectionRef = useRef<HTMLElement>(null);

  // cursor glow
  const gx = useMotionValue(50);
  const gy = useMotionValue(35);
  const bg = useMotionTemplate`radial-gradient(640px circle at ${gx}% ${gy}%, rgba(200,168,122,0.14), transparent 72%)`;

  const onMove = (e: React.MouseEvent) => {
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    gx.set(((e.clientX - r.left) / r.width) * 100);
    gy.set(((e.clientY - r.top) / r.height) * 100);
  };

  // Same props in every mode (MotionConfig makes the rise instant for reduced motion), so the
  // server HTML and the hydrating render match.
  const redAnim = { initial: { opacity: 0, y: 40 } as const, whileInView: { opacity: 1, y: 0 } as const, viewport: { once: true, margin: '-80px' } as const, transition: { duration: 1, ease: EASE } };

  return (
    <section
      ref={sectionRef}
      id="download"
      aria-label="Get Worn"
      onMouseMove={onMove}
      onMouseLeave={() => {
        gx.set(50);
        gy.set(38);
      }}
      className="relative overflow-hidden bg-worn-ink py-24 text-worn-paper sm:py-36"
    >
      {/* cinematics */}
      <div
        aria-hidden="true"
        className="animate-glow-pulse absolute left-1/2 top-1/2 h-[720px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(200,168,122,0.35), transparent)' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(250,248,245,0.07) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      {/* always rendered; it stays empty for reduced motion (decided in its effect) */}
      <GoldParticles density={44} />
      <motion.div aria-hidden="true" className="absolute inset-0" style={{ background: bg }} />

      <div className="section relative z-10 text-center">
        <motion.p
          {...redAnim}
          className="ml-auto mr-auto w-fit ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold"
        >
          Early access · coming to iPhone and Android
        </motion.p>

        <motion.h2
          {...redAnim}
          className="mx-auto mt-6 max-w-[16ch] font-display text-[clamp(44px,7vw,104px)] leading-[1] tracking-tight"
        >
          Your first haul is <em className="grad-text-ink">on us.</em>
        </motion.h2>

        <motion.p
          {...redAnim}
          className="mx-auto mt-6 max-w-[56ch] text-body-l text-worn-paper/70"
        >
          Worn is coming to iPhone and Android. Join the list and we’ll email your
          invite when early access opens. Sign in with Google, add one photo, and
          start with 500 free coins.
        </motion.p>

        {/* actions */}
        <motion.div {...redAnim} className="mt-10 flex flex-col items-center gap-4">
          <WaitlistForm list="play" />
          <Magnetic strength={0.25}>
            <a
              href="#loop"
              className="inline-flex items-center gap-2 rounded-pill border border-worn-paper/25 bg-worn-paper/10 px-7 py-3.5 font-sans text-[15px] font-semibold backdrop-blur transition-colors hover:border-worn-gold hover:text-worn-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
            >
              See how it works
              <ArrowRight size={15} />
            </a>
          </Magnetic>
        </motion.div>

        {/* where it's coming: status labels, not store buttons (there is nothing to tap yet) */}
        <motion.ul
          {...redAnim}
          aria-label="Platforms"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.16em] text-worn-paper/75"
        >
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-worn-gold" />
            <AppleIcon />
            Coming to iPhone
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-worn-gold" />
            <PlayIcon />
            Coming to Android
          </li>
        </motion.ul>
        <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.2em] text-worn-paper/70">
          Free to download · Optional coin packs in-app · Delete your photos any time
        </p>
      </div>
    </section>
  );
}
