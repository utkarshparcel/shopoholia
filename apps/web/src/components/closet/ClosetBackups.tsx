'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { stepSpace, useScrollSteps } from './useScrollSteps';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const rise: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (d: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: d, duration: 0.8, ease: EASE },
  }),
};

/** A detail the backup fixes, as fractions of the mirror photo, and where its loupe floats. */
type Zone = { x: number; y: number; lx: number; ly: number; zoom?: number; plan: string; backup: string };

type Reason = {
  id: 'wax' | 'bloat' | 'hair' | 'party';
  title: string;
  check: string;
  plan: string;
  backup: string;
  rule: string;
  mirror: string;
  alt: string;
  zones: Zone[];
};

const PLAN = { src: '/closet/mirror-planned.webp', alt: 'Monday’s plan: a sage strapless mini dress with tan wedges' };

const REASONS: Reason[] = [
  {
    id: 'wax',
    title: 'Not waxed',
    check: 'Checks what the plan shows',
    plan: 'Monday’s strapless mini shows shoulders, underarms and legs.',
    backup: 'A white tee and wide-leg linen to the floor, with the same wedges and hoops.',
    rule: 'Cover what the plan showed. Keep the rest.',
    mirror: '/closet/mirror-wax.webp',
    alt: 'The backup: a white tee tucked into floor-length beige linen trousers',
    zones: [
      { x: 0.6, y: 0.235, lx: 0.82, ly: 0.13, plan: 'Bare underarms', backup: 'Sleeves' },
      { x: 0.44, y: 0.66, lx: 0.8, ly: 0.62, plan: 'Bare legs', backup: 'Linen to the floor' },
    ],
  },
  {
    id: 'bloat',
    title: 'Bloated',
    check: 'Checks where it sits close',
    plan: 'The sage mini is ruched and tight through the waist and hips.',
    backup: 'Cream linen that falls from the shoulder, so nothing presses at the waist.',
    rule: 'Loose where it counts. The wedges keep it dressed.',
    mirror: '/closet/mirror-bloat.webp',
    alt: 'The backup: a loose cream linen midi dress',
    zones: [{ x: 0.46, y: 0.44, lx: 0.8, ly: 0.4, zoom: 1.05, plan: 'Tight at the waist', backup: 'Falls from the shoulder' }],
  },
  {
    id: 'hair',
    title: 'Bad hair day',
    check: 'Checks what it asks of your hair',
    plan: 'The look was built around hair down and blow-dried.',
    backup: 'Hair up in the claw clip, with a scoop neck and long sleeves carrying the look.',
    rule: 'Hair goes up, the neckline does the talking.',
    mirror: '/closet/mirror-hair.webp',
    alt: 'The backup: hair up in a claw clip and a black long-sleeve knit midi dress',
    zones: [{ x: 0.5, y: 0.075, lx: 0.82, ly: 0.13, plan: 'Hair down, blow-dried', backup: 'Up in a claw clip' }],
  },
  {
    id: 'party',
    title: 'Party or date',
    check: 'Checks where you’re headed after',
    plan: 'Sage and a straw bag, planned for lunch at 1 in 31°.',
    backup: 'Black satin, gold drops and the gold clutch. Same wedges, so it reads dinner, not gala.',
    rule: 'One step up for the evening, without buying a thing.',
    mirror: '/closet/mirror-party.webp',
    alt: 'The backup: a black satin slip midi dress',
    zones: [{ x: 0.47, y: 0.25, lx: 0.82, ly: 0.42, plan: 'Sage for a hot lunch', backup: 'Black satin for dinner' }],
  },
];

const BACKUP_SRCS = REASONS.map((r) => r.mirror);

// Photo aspect (height over width), loupe size (share of the photo's width) and how much it magnifies.
const AR = 935 / 515;
const D = 0.36;
const ZOOM = 2.2;
const pct = (v: number) => `${v * 100}%`;

/* ── Loupes ─────────────────────────────────────────────────────────── */

function Loupe({ z, srcs, active, move }: { z: Zone; srcs: string[]; active: number; move: Transition }) {
  const r = D / 2;
  const zm = z.zoom ?? ZOOM;
  const at = { left: pct(z.lx - r), top: pct(z.ly - r / AR) };
  const view = { width: pct(zm / D), left: pct(0.5 - (z.x * zm) / D), top: pct(0.5 - (z.y * zm * AR) / D) };
  return (
    <motion.div
      aria-hidden="true"
      className="absolute z-10 aspect-square overflow-hidden rounded-full border-2 border-white bg-worn-warm shadow-[0_10px_28px_rgba(40,26,10,0.28)] ring-1 ring-worn-gold"
      style={{ width: pct(D) }}
      initial={{ opacity: 0, scale: 0.6, ...at }}
      animate={{ opacity: 1, scale: 1, ...at }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.25 } }}
      transition={move}
    >
      {srcs.map((s, i) => (
        <motion.img
          key={s}
          src={s}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute max-w-none select-none transition-opacity duration-500"
          style={{ opacity: i === active ? 1 : 0 }}
          initial={view}
          animate={view}
          transition={move}
        />
      ))}
    </motion.div>
  );
}

function Frame({
  label,
  sub,
  srcs,
  alts,
  active,
  zones,
  caption,
  move,
}: {
  label: string;
  sub: string;
  srcs: string[];
  alts: string[];
  active: number;
  zones: Zone[];
  caption: string;
  move: Transition;
}) {
  return (
    <figure className="min-w-0">
      <p className="mb-2 font-mono text-micro uppercase leading-snug tracking-[0.2em] text-worn-gold-deep">
        {label}
        <span className="hidden sm:inline"> · </span>
        <span className="block text-worn-muted sm:inline sm:text-worn-gold-deep">{sub}</span>
      </p>
      <div className="relative aspect-[515/935]">
        <div className="absolute inset-0 overflow-hidden rounded-[18px] bg-worn-warm">
          {srcs.map((s, i) => (
            <img
              key={s}
              src={s}
              alt={i === active ? alts[i] : ''}
              aria-hidden={i === active ? undefined : true}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-500"
              style={{ opacity: i === active ? 1 : 0 }}
            />
          ))}
        </div>
        {/* Marker on the detail, and a thread to its loupe */}
        <svg viewBox="0 0 515 935" aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 h-full w-full">
          <AnimatePresence initial={false}>
            {zones.map((z, i) => {
              const mx = z.x * 515;
              const my = z.y * 935;
              const cx = z.lx * 515;
              const cy = z.ly * 935;
              const len = Math.hypot(cx - mx, cy - my) || 1;
              const rr = (D / 2) * 515;
              const end = { x2: cx - ((cx - mx) / len) * rr, y2: cy - ((cy - my) / len) * rr };
              return (
                <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                  <motion.line
                    initial={{ x1: mx, y1: my, ...end }}
                    animate={{ x1: mx, y1: my, ...end }}
                    transition={move}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <motion.circle initial={{ cx: mx, cy: my }} animate={{ cx: mx, cy: my }} transition={move} r={11} fill="rgba(255,255,255,0.25)" stroke="#ffffff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <motion.circle initial={{ cx: mx, cy: my }} animate={{ cx: mx, cy: my }} transition={move} r={3.5} fill="#ffffff" />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
        <AnimatePresence initial={false}>
          {zones.map((z, i) => (
            <Loupe key={i} z={z} srcs={srcs} active={active} move={move} />
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={caption}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.35, ease: EASE }}
          className="mt-2 min-h-[2.75em] text-caption leading-snug text-worn-ink-soft"
        >
          {caption}
        </motion.p>
      </AnimatePresence>
    </figure>
  );
}

/* ── Section ────────────────────────────────────────────────────────── */

export function ClosetBackups() {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  // Scrolling walks the four checks in order; a row just scrolls to its check.
  const { trackRef, stickRef, jumpTo } = useScrollSteps(REASONS.length, setIdx);

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };
  const move: Transition = reduced ? { duration: 0 } : { duration: 0.75, ease: EASE };

  const r = REASONS[idx];

  return (
    <section id="backups" className="relative scroll-mt-24 border-t border-worn-rule">
      <div className="section section-py">
        <motion.div {...a} variants={rise} custom={0}>
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">Just in case</p>
          <h2 className="mt-6 max-w-[14ch] font-display text-[clamp(32px,4.5vw,56px)] leading-[1.04] tracking-[-0.015em] text-worn-ink text-balance">
            Planned sleeveless. <em className="grad-text font-display">Didn’t wax.</em>
          </h2>
          <p className="mt-4 max-w-[48ch] text-body-l text-worn-muted">
            Worn checks every outfit it plans the way a good stylist would: what it shows, where it sits close,
            what it asks of your hair, where you’re headed after. Each check gets its own backup from your
            closet when one fits, packed with the week.
          </p>
        </motion.div>

        {/* Each check gets an equal share of the scroll while the checks and the photos hold still, centred in the window under the header */}
        <div ref={trackRef} className="mt-10 lg:mt-14">
          <div
            ref={stickRef}
            className="step-stick sticky grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-x-16"
          >
            {/* Phones: which check is on */}
            <motion.ol {...a} variants={rise} custom={0.1} className="flex flex-wrap gap-2 lg:hidden">
              {REASONS.map((x, i) => (
                <li key={x.id}>
                  <button
                    type="button"
                    aria-pressed={i === idx}
                    onClick={() => jumpTo(i)}
                    className={`min-h-[44px] rounded-pill border px-4 text-caption font-semibold transition-colors duration-200 ${
                      i === idx ? 'border-worn-ink bg-worn-ink text-worn-paper' : 'border-worn-rule bg-worn-surface text-worn-ink'
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-micro opacity-60">0{i + 1}</span>
                    {x.title}
                  </button>
                </li>
              ))}
            </motion.ol>

            {/* Plan and backup, side by side, with the detail under a loupe */}
            <motion.div {...a} variants={rise} custom={0.15} className="lg:col-start-2 lg:row-start-1">
              <div className="mx-auto max-w-[640px] rounded-[28px] border border-worn-rule bg-[#f7f1e7] p-4 sm:p-6 lg:max-w-[calc((100svh_-_318px)_*_1.1_+_120px)]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                  <Frame
                    label="The plan"
                    sub="Monday"
                    srcs={[PLAN.src]}
                    alts={[PLAN.alt]}
                    active={0}
                    zones={r.zones}
                    caption={r.zones.map((z) => z.plan).join(' · ')}
                    move={move}
                  />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-worn-rule bg-worn-surface text-worn-ink shadow-sm sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <Frame
                    label="Backup"
                    sub={r.title}
                    srcs={BACKUP_SRCS}
                    alts={REASONS.map((x) => x.alt)}
                    active={idx}
                    zones={r.zones}
                    caption={r.zones.map((z) => z.backup).join(' · ')}
                    move={move}
                  />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={r.id}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="mt-5 min-h-[2.5em] text-center font-display text-[clamp(20px,2.1vw,26px)] italic leading-[1.25] text-worn-ink text-balance"
                  >
                    “{r.rule}”
                  </motion.p>
                </AnimatePresence>
                <p className="mt-3 text-center font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Sample closet</p>
              </div>
            </motion.div>

            {/* The four checks */}
            <motion.div {...a} variants={rise} custom={0.25} className="hidden lg:col-start-1 lg:row-start-1 lg:block">
              <ol className="divide-y divide-worn-rule border-y border-worn-rule">
                {REASONS.map((x, i) => {
                  const on = i === idx;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        aria-expanded={on}
                        onClick={() => jumpTo(i)}
                        className="flex min-h-[56px] w-full items-center gap-4 py-4 text-left"
                      >
                        <span className="w-5 shrink-0 font-mono text-micro text-worn-gold-deep">0{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-display text-[22px] leading-tight ${on ? 'text-worn-ink' : 'text-worn-ink-soft'}`}>{x.title}</span>
                          <span className="mt-0.5 block text-caption text-worn-muted">{x.check}</span>
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-worn-muted transition-transform duration-300 ${on ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {on ? (
                          <motion.div
                            key="detail"
                            initial={reduced ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.45, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <dl className="grid gap-3 pb-5 pl-9 sm:grid-cols-2 sm:gap-6">
                              <div>
                                <dt className="font-mono text-micro uppercase tracking-[0.2em] text-worn-muted">The plan</dt>
                                <dd className="mt-1 text-body leading-snug text-worn-ink-soft">{x.plan}</dd>
                              </div>
                              <div>
                                <dt className="font-mono text-micro uppercase tracking-[0.2em] text-worn-gold-deep">The backup</dt>
                                <dd className="mt-1 text-body leading-snug text-worn-ink">{x.backup}</dd>
                              </div>
                            </dl>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          </div>
          <div aria-hidden="true" style={{ height: stepSpace(REASONS.length) }} />
        </div>
      </div>
    </section>
  );
}
