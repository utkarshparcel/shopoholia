'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

const STEPS = [
  {
    n: '1',
    title: 'See',
    copy: 'The feed. Tonight’s edit, ranked by your style quiz.',
  },
  {
    n: '2',
    title: 'Desire',
    copy: 'Tap Try on me. The piece, on your avatar.',
  },
  {
    n: '3',
    title: 'Commit',
    copy: 'Add to haul. Pay with coins. Pick Express, Standard or Slow burn.',
  },
  {
    n: '4',
    title: 'Wait',
    copy: 'Processing. Packed. Out for delivery. Arriving soon. A push at every step.',
  },
  {
    n: '5',
    title: 'Reveal',
    copy: '“Your haul is here.” Six scenes of you in it, two free.',
  },
];

export function DopamineLoop() {
  const reduced = useReducedMotion();
  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section id="loop" aria-label="The dopamine loop" className="section-py bg-warm">
      <div className="section">
        <motion.div {...a} variants={rise} custom={0} className="mx-auto max-w-[760px] text-center">
          <p className="ornament ml-auto mr-auto w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            The mechanic
          </p>
          <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
            The fix for shopping is <em className="grad-text">more shopping.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-body-l text-worn-ink-soft">
            Same scroll, same little thrill, same wait by the door. Nothing
            arrives but the renders, so nothing piles up.
          </p>
        </motion.div>

        <div className="mx-auto mt-14 grid max-w-[1100px] grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              {...a}
              variants={rise}
              custom={0.1 + i * 0.08}
              className={`relative rounded-lg bg-worn-surface p-5 shadow-card md:p-6 ${
                i === STEPS.length - 1 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <span aria-hidden="true" className="font-display text-[48px] leading-none text-stroke-ink">
                {s.n}
              </span>
              <h3 className="mt-4 font-display text-[24px] text-worn-ink">{s.title}</h3>
              <p className="mt-2 text-body text-worn-ink-soft">{s.copy}</p>
            </motion.div>
          ))}
        </div>

        <motion.p {...a} variants={rise} custom={0.4} className="mt-10 text-center font-mono text-micro uppercase tracking-[0.22em] text-worn-muted">
          see → desire → commit → wait → reveal
        </motion.p>
      </div>
    </section>
  );
}
