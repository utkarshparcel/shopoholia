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
import { AppleIcon, PlayIcon, StoreButtons } from './StoreButtons';
import { APP_EVERYWHERE, APP_LIVE, APP_STORE_URL, LIVE_PLATFORMS, PLAY_STORE_URL } from '@/lib/site';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
          {APP_LIVE ? `Out now on ${LIVE_PLATFORMS}` : 'Early access · coming to iPhone and Android'}
        </motion.p>

        <motion.h2
          {...redAnim}
          className="mx-auto mt-6 max-w-[16ch] text-balance font-display text-[clamp(44px,7vw,104px)] leading-[1] tracking-tight"
        >
          Your first haul is <em className="grad-text-ink">on us.</em>
        </motion.h2>

        <motion.p
          {...redAnim}
          className="mx-auto mt-6 max-w-[56ch] text-body-l text-worn-paper/70"
        >
          {APP_EVERYWHERE
            ? 'Download Worn, sign in with Google, add one photo, and start with 500 free coins.'
            : APP_LIVE
              ? `Download Worn on ${LIVE_PLATFORMS}, sign in with Google, add one photo, and start with 500 free coins. On ${APP_STORE_URL ? 'Android' : 'iPhone'}? Join the list and we’ll email you when it’s out there too.`
              : 'Worn is coming to iPhone and Android. Join the list and we’ll email your invite when early access opens. Sign in with Google, add one photo, and start with 500 free coins.'}
        </motion.p>

        {/* actions */}
        <motion.div {...redAnim} className="mt-10 flex flex-col items-center gap-4">
          <StoreButtons />
          {APP_EVERYWHERE ? null : <WaitlistForm list="play" />}
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

        {/* where it's out or coming: status labels (the store buttons above are the things to tap) */}
        <motion.ul
          {...redAnim}
          aria-label="Platforms"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.16em] text-worn-paper/75"
        >
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-worn-gold" />
            <AppleIcon />
            {APP_STORE_URL ? 'On the App Store' : 'Coming to iPhone'}
          </li>
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-worn-gold" />
            <PlayIcon />
            {PLAY_STORE_URL ? 'On Google Play' : 'Coming to Android'}
          </li>
        </motion.ul>
        <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.2em] text-worn-paper/70">
          {APP_LIVE ? 'Free' : 'Free when it launches'} · Optional coin packs in-app · Delete your photos any time
        </p>
      </div>
    </section>
  );
}
