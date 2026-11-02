'use client';

import { motion, type Variants } from 'framer-motion';
import { reveal } from '@/lib/motion';

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
    title: 'Browse',
    copy: 'Tonight’s edit: real pieces from real stores, ranked by a five-question style quiz.',
  },
  {
    n: '2',
    title: 'Try it on',
    copy: 'One photo makes your avatar. Tap Try on me and see the piece on you.',
  },
  {
    n: '3',
    title: 'Check out',
    copy: 'Add it to your haul and pay with coins, never your card. Pick Express, Standard or Slow burn.',
  },
  {
    n: '4',
    title: 'Track it',
    copy: 'Packed, out for delivery, arriving soon: a notification at every step.',
  },
  {
    n: '5',
    title: 'Unbox it',
    copy: 'Your haul arrives as photos of you wearing it, in six scenes. Two are free.',
  },
];

export function DopamineLoop() {

  return (
    <section id="loop" aria-label="How it works" className="section-py bg-warm">
      <div className="section">
        <motion.div {...reveal} variants={rise} custom={0} className="mx-auto max-w-[760px] text-center">
          <p className="ornament ml-auto mr-auto w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            How it works
          </p>
          <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
            Everything you love about a haul. <em className="grad-text">Nothing ships.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-body-l text-worn-ink-soft">
            Same scroll, same try-on, same wait for the doorbell. What arrives is
            photos of you in it, so nothing costs real money and nothing piles up.
          </p>
        </motion.div>

        <div className="mx-auto mt-14 grid max-w-[1100px] grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              {...reveal}
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

        <motion.p {...reveal} variants={rise} custom={0.4} className="mt-10 text-center font-mono text-micro uppercase tracking-[0.22em] text-worn-muted">
          browse → try on → check out → track → unbox
        </motion.p>
      </div>
    </section>
  );
}
