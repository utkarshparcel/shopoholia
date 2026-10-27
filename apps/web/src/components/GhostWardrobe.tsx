'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Tag } from 'lucide-react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

const RECEIPTS = [
  { label: 'Receipt 01', line: 'The wedding one. Worn once.' },
  { label: 'Receipt 02', line: 'Tags still on. Two seasons.' },
  { label: 'Receipt 03', line: 'The 1 AM cart. Regretted at 9.' },
  { label: 'Receipt 04', line: 'Twelve black tops. Nothing to wear.' },
];

const GHOSTS = [
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/04/021348591258e001/NM-PRC-414-DRS-26-APR-32495-YELLOW(1).webp',
    tag: '0 wears',
    rot: -5,
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/04152538fdacdf9c/NM-PRC-374-DRS-26-JUN-34296-BLACK(1).webp',
    tag: 'tags on',
    rot: 3,
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/12073053427750de/NM-PRC-455-DRS-26-JUN-34374-SAGE(1).webp',
    tag: 'worn 1×',
    rot: -2,
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/05/09102331e3473fe4/NM-IN-56-DRS-24-APR-5058-RED(0).webp',
    tag: '0 wears',
    rot: 6,
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2025/11/2008454511161b6b/NM-PRC-9997-DRS-25-NOV-26970-LIGHTPINK(1).webp',
    tag: 'tags on',
    rot: -7,
  },
  {
    img: 'https://assets.newme.asia/wp-content/uploads/2026/03/1715592685b4dd97/NM-PRC-178-DRS-26-MAR-31596-OFFWHITE(1).webp',
    tag: '0 wears',
    rot: 2,
  },
];

export function GhostWardrobe() {
  const reduced = useReducedMotion();
  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  return (
    <section id="manifesto" aria-label="The ghost wardrobe" className="section-py relative overflow-hidden bg-worn-paper">
      <div className="section">
        <motion.div {...a} variants={rise} custom={0} className="mx-auto max-w-[780px] text-center">
          <p className="ornament ml-auto mr-auto w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            The ghost wardrobe
          </p>
          <h2 className="mt-5 font-display text-[clamp(36px,5.5vw,72px)] leading-[1.02] tracking-tight text-worn-ink">
            Huge wardrobe. <em className="grad-text">Nothing to wear.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-[54ch] text-body-l text-worn-ink-soft">
            Every piece in there was the same purchase: the buying high, bought
            again. Worn keeps the high and drops the pile.
          </p>
        </motion.div>

        {/* receipts */}
        <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
          {RECEIPTS.map((r, i) => (
            <motion.div
              key={r.label}
              {...a}
              variants={rise}
              custom={0.05 * i}
              className="border-t border-worn-rule pt-5"
            >
              <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">
                {r.label}
              </p>
              <p className="mt-3 font-display text-[clamp(22px,2.4vw,32px)] leading-tight text-worn-ink">
                {r.line}
              </p>
            </motion.div>
          ))}
        </div>

        {/* ghost rack */}
        <div className="mt-16 flex flex-wrap items-end justify-center gap-5 sm:gap-7">
          {GHOSTS.map((g, i) => (
            <motion.figure
              key={g.tag + i}
              {...a}
              variants={rise}
              custom={0.04 * i}
              className="relative w-[124px] overflow-hidden rounded-card border border-worn-rule bg-worn-warm shadow-sm sm:w-[140px]"
              style={{ transform: `rotate(${g.rot}deg)` }}
            >
              <div className="h-[150px] w-full opacity-60 grayscale-[35%]">
                <img src={g.img} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
              <figcaption className="m-2 inline-flex w-[calc(100%-16px)] items-center justify-center gap-1 rounded-pill bg-worn-ink/90 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-worn-paper/85">
                <Tag size={9} />
                {g.tag}
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <motion.p
          {...a}
          variants={rise}
          custom={0.2}
          className="mx-auto mt-14 max-w-[46ch] text-center font-display text-[clamp(22px,3vw,32px)] italic leading-snug text-worn-ink-soft"
        >
          None of this means you shopped badly. It means the part you loved was
          the buying. We built an app for exactly that part.
        </motion.p>
      </div>
    </section>
  );
}
