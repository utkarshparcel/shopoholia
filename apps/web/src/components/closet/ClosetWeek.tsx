'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from 'framer-motion';
import { ArrowDown, CalendarDays } from 'lucide-react';
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

type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DrawerId = DayId | 'backup';

type Day = {
  id: DayId;
  short: string;
  name: string;
  /** What's on that day, from the (sample) calendar and forecast. */
  plan: string;
  outfit: string;
  why: string;
};

const DAYS: Day[] = [
  { id: 'mon', short: 'Mon', name: 'Monday', plan: 'Lunch at 1 · 31°', outfit: 'Sage mini, tan wedges, gold hoops, straw bag', why: 'Light and bare-shouldered for a hot lunch.' },
  { id: 'tue', short: 'Tue', name: 'Tuesday', plan: 'Offsite, all day', outfit: 'Striped knit midi, white sneakers', why: 'Polished in the room, easy for nine hours.' },
  { id: 'wed', short: 'Wed', name: 'Wednesday', plan: 'Work from home · gym at 7', outfit: 'Grey knit set, running shoes', why: 'Calls on camera, then straight out the door.' },
  { id: 'thu', short: 'Thu', name: 'Thursday', plan: 'Dinner at 8', outfit: 'Red one-shoulder mini, gold heels', why: 'Out for the first time since June.' },
  { id: 'fri', short: 'Fri', name: 'Friday', plan: 'Office, then drinks', outfit: 'Yellow midi, tan wedges', why: 'Desk to drinks without going home.' },
  { id: 'sat', short: 'Sat', name: 'Saturday', plan: 'Brunch, then a long walk', outfit: 'Linen shirt, denim shorts, white sneakers, straw bag', why: 'Cool for the heat, sneakers for the walk, a bag for the day.' },
  { id: 'sun', short: 'Sun', name: 'Sunday', plan: 'Slow day', outfit: 'Cream linen co-ord, leather slides', why: 'Nothing to think about.' },
];

const BACKUPS = [
  { k: 'Bad hair day', v: 'Black knit midi, hair up in the claw clip' },
  { k: 'Bloated', v: 'Cream linen midi, nothing at the waist' },
  { k: 'Not waxed', v: 'Wide-leg linen and a white tee' },
  { k: 'Party or date', v: 'Black satin slip and gold drops' },
];

/** Top to bottom, as the drawers sit in the dresser. */
const STACK: DrawerId[] = ['backup', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** The order scrolling opens them in, and the order of the day buttons. */
const ORDER: DrawerId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'backup'];

/** Intrinsic size of the drawer photos: top-down, cropped to the inside of the drawer. */
const PHOTO_W = 720;
const PHOTO_H = 267;

const grainSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='420' height='140'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.005 0.38' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 0.42 0 0 0 0 0.27 0 0 0 0 0.12 0.95 0 0 0 -0.42'/></filter><rect width='420' height='140' filter='url(#g)'/></svg>";
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(grainSvg)}")`;
const OAK = 'linear-gradient(180deg, #eedbb8 0%, #e4caa1 58%, #d9bc8f 100%)';
const CARCASS = 'linear-gradient(90deg, #c7a371 0%, #d7b885 18%, #d3b07d 82%, #c09a67 100%)';
const BRASS = 'linear-gradient(135deg, #f6e2ae 0%, #d6b066 38%, #a87f3a 70%, #e4c784 100%)';
const KNOB = {
  background: 'radial-gradient(circle at 35% 30%, #fff3d6 0%, #e2c27f 32%, #a77d3c 74%, #7a5a26 100%)',
  boxShadow: '0 2px 3px rgba(60,40,10,0.45)',
};
const SHUT = '0 0px 0px -10px rgba(52,32,12,0), inset 0 1px 0 rgba(255,255,255,0.45)';
const OUT = '0 24px 26px -12px rgba(52,32,12,0.55), inset 0 1px 0 rgba(255,255,255,0.45)';

const nameOf = (id: DrawerId) => DAYS.find((d) => d.id === id)?.name ?? 'Just in case';

function Drawer({
  id,
  index,
  open,
  raised,
  reveal,
  transition,
  onToggle,
}: {
  id: DrawerId;
  index: number;
  open: boolean;
  raised: boolean;
  reveal: number;
  transition: Transition;
  onToggle: () => void;
}) {
  const day = DAYS.find((d) => d.id === id);
  const backup = !day;
  const alt = day ? `${day.name}, folded and ready: ${day.outfit.toLowerCase()}` : 'The four backups, folded side by side';
  return (
    <div
      className={`relative ${backup ? 'h-[calc(var(--dh)*0.9)]' : 'h-[var(--dh)]'}`}
      style={{ zIndex: open ? 30 : raised ? 20 : 1 }}
    >
      <div aria-hidden="true" className="absolute inset-0 rounded-[4px] bg-[#4b3622] shadow-[inset_0_8px_12px_rgba(0,0,0,0.5)]" />

      {/* The inside, seen from above as it comes out: the photo rides on the drawer and the carcass hides the rest */}
      <div
        id={`drawer-${id}`}
        aria-hidden={!open}
        className="pointer-events-none absolute -left-[2%] -right-[2%] top-0 overflow-hidden"
        style={{ height: reveal, clipPath: 'polygon(1.9% 0, 98.1% 0, 100% 100%, 0 100%)' }}
      >
        <motion.div className="absolute inset-x-0 bottom-0" initial={false} animate={{ y: open ? 0 : -reveal }} transition={transition}>
          <img
            src={`/closet/drawer-${id}.webp`}
            width={PHOTO_W}
            height={PHOTO_H}
            alt={alt}
            loading="lazy"
            draggable={false}
            className="block h-auto w-full select-none"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 shadow-[inset_14px_0_18px_-12px_rgba(40,24,8,0.5),inset_-14px_0_18px_-12px_rgba(40,24,8,0.5)]"
          />
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[45%]"
          style={{ background: 'linear-gradient(180deg, rgba(36,22,8,0.62), rgba(36,22,8,0))' }}
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={transition}
        />
      </div>

      {/* The front */}
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`drawer-${id}`}
        aria-label={`${nameOf(id)} drawer`}
        className="absolute inset-0 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-worn-gold focus-visible:ring-offset-2"
        style={{
          backgroundImage: `${GRAIN}, ${OAK}`,
          backgroundSize: '420px 140px, 100% 100%',
          backgroundPosition: `${-index * 67}px ${-index * 29}px, 0 0`,
        }}
        initial={false}
        animate={{ y: open ? reveal : 0, scale: open ? 1.04 : 1, boxShadow: open ? OUT : SHUT }}
        transition={transition}
      >
        {/* top edge of the board, visible once it's out */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-x-0 -top-[5px] h-[5px] rounded-t-[2px]"
          style={{ background: 'linear-gradient(180deg, #f7e9ce, #e8d1aa)' }}
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={transition}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-[4px]"
          style={{ background: 'linear-gradient(90deg, rgba(255,244,222,0.38), transparent 46%)' }}
        />
        <span aria-hidden="true" className="absolute left-[15%] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full" style={KNOB} />
        <span aria-hidden="true" className="absolute right-[15%] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full" style={KNOB} />
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] p-[2px] shadow-[0_1px_2px_rgba(60,40,10,0.35)]"
          style={{ background: BRASS }}
        >
          <span
            className={`block whitespace-nowrap rounded-[2px] px-2.5 py-[4px] font-mono text-[10px] uppercase leading-none tracking-[0.2em] max-[359px]:px-1.5 max-[359px]:tracking-[0.1em] sm:text-[11px] ${
              backup ? 'bg-worn-gold-tint text-worn-gold-deep' : 'bg-[#fbf6ea] text-worn-ink-soft'
            }`}
          >
            {day ? day.short : 'Just in case'}
          </span>
        </span>
      </motion.button>
    </div>
  );
}

export function ClosetWeek() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<DrawerId | null>(null);
  const [prev, setPrev] = useState<DrawerId | null>(null);
  const [slotW, setSlotW] = useState(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const lastReveal = useRef(0);

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const set = () => setSlotW(el.clientWidth);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // How far a drawer comes out: most of its photo, which spans the slot plus the perspective flare.
  const reveal = slotW ? Math.round(((slotW * 1.04 * PHOTO_H) / PHOTO_W) * 0.92) : 0;
  const resized = lastReveal.current !== reveal;
  useEffect(() => {
    lastReveal.current = reveal;
  });
  const move: Transition = reduced || resized ? { duration: 0 } : { duration: 0.8, ease: EASE };

  const select = (id: DrawerId | null) => {
    if (id === open) return;
    setPrev(open);
    setOpen(id);
  };

  // Scrolling opens the week a drawer at a time, shut first and the backups last; a drawer or a day just scrolls to it.
  const { trackRef, stickRef, jumpTo } = useScrollSteps(ORDER.length + 1, (i) => select(i === 0 ? null : ORDER[i - 1]));
  const stepOf = (id: DrawerId) => ORDER.indexOf(id) + 1;

  const day = DAYS.find((d) => d.id === open);

  return (
    <section id="week" className="relative scroll-mt-24 overflow-x-clip">
      <div className="section section-py">
        <motion.div {...a} variants={rise} custom={0}>
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">Planned every Sunday</p>
          <h2 className="mt-6 max-w-[16ch] font-display text-[clamp(32px,4.5vw,56px)] leading-[1.04] tracking-[-0.015em] text-worn-ink text-balance">
            Next week is already <em className="grad-text font-display">folded.</em>
          </h2>
          <p className="mt-4 max-w-[52ch] text-body-l text-worn-muted">
            Every Sunday evening Worn plans Monday to Sunday from clothes you already own, around your
            calendar and the weather. The top drawer holds up to four backups for the mornings that go
            sideways.
          </p>
        </motion.div>

        {/* Each drawer gets an equal share of the scroll while the dresser holds still, centred in the window under the header */}
        <div ref={trackRef} className="mt-10 lg:mt-14">
          <div
            ref={stickRef}
            className="step-stick sticky grid grid-cols-[minmax(0,13fr)_minmax(0,12fr)] items-center gap-3 sm:items-start sm:gap-6 lg:grid-cols-2 lg:items-center lg:gap-x-16"
          >
            {/* The dresser, inset on phones so its top stays inside the column */}
            <motion.div {...a} variants={rise} custom={0.15}>
              <div className="relative mx-auto w-full max-w-[460px] px-[8px] sm:px-0" style={{ paddingBottom: Math.max(0, reveal - 44) }}>
                {/* window light on the wall behind it */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-x-[30%] -top-[14%] bottom-[8%] blur-3xl"
                  style={{ background: 'radial-gradient(closest-side, rgba(255,224,168,0.5), transparent)' }}
                />
                <div className="relative">
                  {/* the top, seen from above, then its front edge */}
                  <div
                    aria-hidden="true"
                    className="relative -mx-[8px] h-[26px] sm:-mx-[14px] sm:h-[32px]"
                    style={{
                      clipPath: 'polygon(3.5% 0, 96.5% 0, 100% 100%, 0 100%)',
                      background: 'linear-gradient(180deg, #e6d1ab 0%, #f2e4c9 62%, #ead6b2 100%)',
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="relative -mx-[8px] h-[14px] rounded-[3px] sm:-mx-[14px] sm:h-[16px]"
                    style={{
                      backgroundImage: `${GRAIN}, linear-gradient(180deg, #dcbf90, #c9a674)`,
                      boxShadow: '0 8px 10px -6px rgba(60,38,14,0.45)',
                    }}
                  />
                  <div
                    className="relative rounded-b-[6px] px-[10px] pb-[12px] pt-[10px]"
                    style={{ backgroundImage: `${GRAIN}, ${CARCASS}`, boxShadow: '24px 30px 60px -20px rgba(60,38,14,0.3)' }}
                  >
                    {/* Drawers shrink on short windows so the open bottom one still fits under the header */}
                    <div
                      ref={stackRef}
                      className="flex flex-col gap-[6px] [--dh:clamp(30px,calc((100svh_-_260px)_/_7.9),44px)] sm:[--dh:clamp(30px,calc((100svh_-_372px)_/_7.9),52px)]"
                    >
                      {STACK.map((id, i) => (
                        <Drawer
                          key={id}
                          id={id}
                          index={i}
                          open={open === id}
                          raised={prev === id}
                          reveal={reveal}
                          transition={open === id && prev ? { ...move, delay: move.duration ? 0.18 : 0 } : move}
                          onToggle={() => jumpTo(open === id ? 0 : stepOf(id))}
                        />
                      ))}
                    </div>
                  </div>
                  <div aria-hidden="true" className="relative mx-[6px] h-[12px] rounded-b-[4px]" style={{ background: 'linear-gradient(180deg, #b8935f, #a5814f)' }} />
                  <div aria-hidden="true" className="relative flex justify-between px-[22px]">
                    {[0, 1].map((k) => (
                      <span
                        key={k}
                        className="block h-[22px] w-[16px] sm:h-[28px]"
                        style={{
                          clipPath: 'polygon(0 0, 100% 0, 78% 100%, 22% 100%)',
                          background: 'linear-gradient(90deg, #a07b49, #c19c68 50%, #9c7745)',
                        }}
                      />
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute -bottom-[6px] left-1/2 h-[18px] w-[104%] -translate-x-1/2 rounded-[50%]"
                    style={{ background: 'radial-gradient(closest-side, rgba(60,38,14,0.3), transparent)' }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Day buttons and the day's card */}
            <motion.div {...a} variants={rise} custom={0.25}>
              <div role="group" aria-label="Open a drawer" className="hidden grid-cols-4 gap-1.5 sm:grid lg:grid-cols-[repeat(7,minmax(0,1fr))_auto]">
                {ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={open === id}
                    onClick={() => jumpTo(stepOf(id))}
                    className={`min-h-[44px] rounded-[12px] border ${id === 'backup' ? 'px-3' : 'px-1'} text-caption font-semibold transition-colors duration-200 ${
                      open === id
                        ? 'border-worn-ink bg-worn-ink text-worn-paper'
                        : 'border-worn-rule bg-worn-surface text-worn-ink hover:border-worn-gold'
                    }`}
                  >
                    {DAYS.find((d) => d.id === id)?.short ?? 'Backups'}
                  </button>
                ))}
              </div>

              {/* Tall enough on phones for every day, so the centred card holds still as the days change */}
              <div className="relative flex min-h-[312px] flex-col rounded-[22px] border border-worn-rule bg-worn-surface p-4 shadow-card sm:mt-4 sm:min-h-[248px] sm:p-7 lg:min-h-[360px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={open ?? 'none'}
                    className="flex-1"
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.45, ease: EASE }}
                  >
                    {day ? (
                      <>
                        <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold-deep">{day.name}</p>
                        <p className="mt-3 flex items-center gap-2 text-caption text-worn-muted">
                          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {day.plan}
                        </p>
                        <p className="mt-3 font-display text-[19px] leading-[1.12] text-worn-ink sm:text-[clamp(24px,2.6vw,32px)]">{day.outfit}</p>
                        <p className="mt-3 text-body text-worn-ink-soft">{day.why}</p>
                      </>
                    ) : open === 'backup' ? (
                      <>
                        <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold-deep">Just in case</p>
                        <p className="mt-3 font-display text-[18px] leading-[1.15] text-worn-ink sm:text-[clamp(22px,2.2vw,28px)]">
                          Up to four backups, packed with the week.
                        </p>
                        <ul className="mt-4 hidden gap-2 sm:grid sm:grid-cols-2">
                          {BACKUPS.map((b) => (
                            <li key={b.k} className="rounded-[12px] border border-worn-rule bg-worn-paper px-3 py-2">
                              <p className="text-caption font-semibold text-worn-ink">{b.k}</p>
                              <p className="text-caption leading-snug text-worn-muted">{b.v}</p>
                            </li>
                          ))}
                        </ul>
                        <a
                          href="#backups"
                          className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-caption font-semibold text-worn-ink underline-offset-4 hover:underline"
                        >
                          How each one is picked <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold-deep">Packed Sunday, 7:00 PM</p>
                        <p className="mt-3 font-display text-[19px] leading-[1.12] text-worn-ink sm:text-[clamp(24px,2.6vw,32px)]">
                          Seven days and the backups, folded and waiting.
                        </p>
                        <p className="mt-3 text-body text-worn-ink-soft">Scroll to open the week, one drawer at a time.</p>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
                <p className="mt-5 font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Sample week</p>
              </div>
            </motion.div>
          </div>
          <div aria-hidden="true" style={{ height: stepSpace(ORDER.length + 1) }} />
        </div>
      </div>
    </section>
  );
}
