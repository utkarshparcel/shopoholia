'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Mouse,
  Pause,
  Play,
  RefreshCcw,
  ScanFace,
  Send,
  Sparkles,
} from 'lucide-react';
import { GoldParticles } from './GoldParticles';
import { gsap, ScrollTrigger } from '@/lib/gsap';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ── Data — real listings from the scraped catalog (apps/api seed): titles, coin prices and sizes as seeded ── */

const DROP = 2; // tonight's pick — the sage mini. Tap any other card on the rail and that one flies instead.

const DRESSES = [
  {
    key: 'yellow',
    short: 'Yellow floral maxi',
    tag: '#yellowfloral',
    name: 'Yellow floral a-line maxi dress',
    size: 'XS',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/04/021348591258e001/NM-PRC-414-DRS-26-APR-32495-YELLOW(1).webp',
    caption: '1,049 coins · XS',
  },
  {
    key: 'black',
    short: 'Black cowl-neck midi',
    tag: '#lbd',
    name: 'Black cowl neck midi dress',
    size: 'S',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/04152538fdacdf9c/NM-PRC-374-DRS-26-JUN-34296-BLACK(1).webp',
    caption: '1,049 coins · S',
  },
  {
    key: 'sage',
    short: 'Sage ruched mini',
    tag: '#sagemini',
    name: 'Sage ruched bodycon mini dress',
    size: 'XS',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/06/12073053427750de/NM-PRC-455-DRS-26-JUN-34374-SAGE(1).webp',
    caption: 'Tonight’s pick · 1,049 coins',
  },
  {
    key: 'red',
    short: 'Red one-shoulder',
    tag: '#reddress',
    name: 'Red one shoulder ruched dress',
    size: 'XS',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/05/09102331e3473fe4/NM-IN-56-DRS-24-APR-5058-RED(0).webp',
    caption: '450 coins · XS',
  },
  {
    key: 'pink',
    short: 'Pink sequin halter',
    tag: '#sequins',
    name: 'Light pink sequin halter neck maxi dress',
    size: 'S',
    img: 'https://assets.newme.asia/wp-content/uploads/2025/11/2008454511161b6b/NM-PRC-9997-DRS-25-NOV-26970-LIGHTPINK(1).webp',
    caption: '1,649 coins · S',
  },
  {
    key: 'stripe',
    short: 'Striped knit maxi',
    tag: '#stripes',
    name: 'Off white striped maxi dress',
    size: 'XS',
    img: 'https://assets.newme.asia/wp-content/uploads/2026/03/1715592685b4dd97/NM-PRC-178-DRS-26-MAR-31596-OFFWHITE(1).webp',
    caption: '949 coins · XS',
  },
];
type Dress = (typeof DRESSES)[number];

/* every dress, re-shot at every location — mediagen edits of one studio render per dress (public/renders) */
const render = (d: Dress, look: string) => `/renders/${d.key}-${look}.webp`;

/* steps = what the stage shows; beats = how far you've scrolled through it */
const STEPS = [
  { n: '01', label: 'The feed', dwell: 4600 },
  { n: '02', label: 'Try on', dwell: 2500 },
  { n: '03', label: 'On you', dwell: 2800 },
  { n: '04', label: 'The reveal', dwell: 2200 }, // per scene
  { n: '05', label: 'Lookbook', dwell: 7000 },
  { n: '06', label: 'There’s more', dwell: 0 },
];
/* beat 0 the feed · 1 try on (lands on you) · 2–7 the six scenes · 8 lookbook · 9 there's more */
const BEATS = 10;
const STEP_BEAT = [0, 1, 1, 2, 8, 9];
const beatOf = (p: number) => Math.max(0, Math.min(BEATS - 1, Math.floor(p * BEATS)));

type Scene = { id: string; label: string; caption: string; floor: string };

/* the app's six reveal scenes, in the app's order */
const SCENES: Scene[] = [
  { id: 'studio', label: 'Studio', caption: 'Studio — clean light, free with every piece.', floor: 'rgba(250,248,245,0.16)' },
  { id: 'beach', label: 'Golden hour', caption: 'Golden hour — warm light, also free.', floor: 'rgba(255,150,70,0.24)' },
  { id: 'cafe', label: 'Street', caption: 'Street — out in the city, 50 coins.', floor: 'rgba(255,190,110,0.22)' },
  { id: 'rooftop', label: 'Editorial dark', caption: 'Editorial dark — the moody one, 50 coins.', floor: 'rgba(255,140,100,0.16)' },
  { id: 'night', label: 'Night', caption: 'Night — neon and rain, 50 coins.', floor: 'rgba(120,140,255,0.18)' },
  { id: 'mirror', label: 'Candid', caption: 'Candid — the off-guard one, 50 coins.', floor: 'rgba(250,248,245,0.16)' },
];
const LOOKS = SCENES.map((s) => s.id);

const CLOSET_BG =
  'radial-gradient(60% 55% at 50% 32%, rgba(200,168,122,0.20), transparent 70%), linear-gradient(180deg, #11100d 0%, #0c0b09 100%)';

const COPY = {
  kicker: 'WORN PLAY · TONIGHT’S EDIT',
  kickerMore: 'WORN CLOSET · THE NEXT CHAPTER',
  steps: [
    { eyebrow: 'The feed', line: 'Everything you’d buy at 1 AM.', sub: 'Drag to browse · tap a piece to try it on' },
    { eyebrow: 'Try on', line: 'No fitting room. No return label.', sub: '' },
    { eyebrow: 'On you', line: 'It’s on you. Haul it in coins, not cash.', sub: 'Nothing ships · nothing to return · nothing to regret' },
    { eyebrow: 'The reveal', line: '', sub: 'Your haul arrived · scroll the scenes · restyle from your haul' },
    { eyebrow: 'Lookbook', line: 'Nothing shipped. Nothing wasted. Still the high.', sub: 'Saved to your lookbook · share it · 0 parcels' },
    { eyebrow: 'There’s more', line: 'That was the itch. This is the closet.', sub: '' },
  ],
};

/* the next chapter — what Worn does for the clothes you already bought */
const CLOSET_POINTS = ['Catalog in one tap', 'Week planner', 'Cost per wear', 'Gift cards & warranties', 'Sell, swap, donate'];

type LenisLike = { scrollTo: (y: number, opts?: { immediate?: boolean }) => void };

/* ── Small parts ─────────────────────────────────────────── */

function Hanger() {
  return (
    <svg viewBox="0 0 24 30" className="mx-auto h-7 w-6 text-worn-gold-deep/80" aria-hidden="true">
      <path
        d="M12 2.5a3.5 3.5 0 0 1 3.5 3.5c0 2.2-2 2.8-3 4.2-.4.6-.5 1.3-.5 2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M3 27 Q12 13 21 27" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 27 H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DressCard({
  d,
  w,
  h,
  eager,
  interactive,
  cardRef,
  className = '',
  style,
}: {
  d: Dress;
  w: number;
  h: number;
  eager?: boolean;
  interactive?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <figure
      ref={cardRef}
      className={`rounded-card bg-worn-paper/95 p-2.5 pb-3.5 shadow-pop ${
        interactive ? 'cursor-pointer transition-transform duration-300 hover:scale-[1.05]' : ''
      } ${className}`}
      style={{ width: w, height: h, ...style }}
    >
      <Hanger />
      <div className="mt-1 w-full overflow-hidden rounded-md bg-worn-warm-deep" style={{ height: h - 110 }}>
        <img src={d.img} alt="" loading={eager ? 'eager' : 'lazy'} draggable={false} className="h-full w-full object-cover" />
      </div>
      <figcaption className="mt-2 truncate text-center font-mono text-[10px] leading-snug tracking-wide text-worn-ink/70">
        {d.name}
      </figcaption>
      <span className="mt-1.5 block truncate rounded-pill border border-worn-gold/50 bg-worn-gold-tint px-2 py-0.5 text-center font-mono text-[9px] uppercase tracking-wider text-worn-gold-deep">
        {d.caption}
      </span>
    </figure>
  );
}

/* Mannequin (dress form) — the pre-landing silhouette */
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

/* ── The Drop stage — carousel → flight → on you → locations → keep it ── */

const RING_BACK = { scale: 0.62, yPercent: -24, autoAlpha: 0.28 };
const RING_FRONT = { scale: 1, yPercent: 0, autoAlpha: 1 };
const BURST = 14;
const SHIMMER_FROM = { xPercent: -140, skewX: -18, autoAlpha: 0.95 };
const SHIMMER_TO = { xPercent: 180, skewX: -18, autoAlpha: 0, duration: 0.85, ease: 'power2.out' };

export function DropStage() {
  const reduced = !!useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const ringWrapRef = useRef<HTMLDivElement>(null);
  const modelSlotRef = useRef<HTMLDivElement>(null);
  const slotInnerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const mannequinRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cloneRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const filled = useInView(sectionRef, { amount: 0.98 }); // the stage fills the viewport — pinned, or parked on its first frame

  const [step, setStep] = useState(0);
  const [scene, setScene] = useState(0);
  const [chosen, setChosen] = useState(DROP);
  const [playing, setPlaying] = useState(true);
  const [beat, setBeat] = useState(0); // bumps on every go(), so re-entering the current step re-arms autoplay
  const [pinned, setPinned] = useState(false); // strictly inside the pin range — the page scroll is walking the stage
  const [geom, setGeom] = useState({ R: 300, w: 150, h: 232, sw: 299, sh: 448, H: 800, small: false });
  const active = pinned || filled;

  const stepRef = useRef(0);
  const sceneRef = useRef(0);
  const beatRef = useRef(0);
  const stRef = useRef<ScrollTrigger | null>(null);
  const chosenRef = useRef(DROP);
  const rot = useRef({ v: 0 }); // ring rotation in degrees (tweenable)
  const spin = useRef(true);
  const dragging = useRef(false);
  const hovering = useRef(false);
  const chosenHidden = useRef(false);
  const timers = useRef<number[]>([]);
  const anim = useRef<{ kill: () => void } | null>(null);
  const drag = useRef({ x0: 0, r0: 0, lastX: 0, lastT: 0, v: 0, moved: false, idx: -1 });

  const dress = DRESSES[chosen];
  const live = SCENES[scene];

  /* geometry follows the stage */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const small = W < 640;
      const w = small ? 112 : 150;
      const h = small ? 176 : 232;
      const R = Math.max(small ? 150 : 200, Math.min(W * 0.27, 330));
      const maxW = small ? W * 0.6 : Math.max(220, Math.min(W * 0.28, 310));
      const sh = Math.round(Math.min(H * 0.56, 465, maxW * 1.5));
      setGeom({ R, w, h, sw: Math.round(sh / 1.5), sh, H, small });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* warm what the next tap could show, so every crossfade and wipe is instant */
  useEffect(() => {
    if (!inView) return;
    const urls = new Set<string>();
    DRESSES.forEach((d) => urls.add(render(d, 'studio')));
    LOOKS.forEach((look) => urls.add(render(dress, look)));
    if (step >= 3) DRESSES.forEach((d) => urls.add(render(d, live.id)));
    urls.forEach((u) => {
      const im = new Image();
      im.src = u;
    });
  }, [dress, live.id, step, inView]);

  /* the conveyor — every card hangs facing you and rides the ring (only while the stage is on screen) */
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const N = DRESSES.length;
    const base = 360 / N;
    const tick = () => {
      if (spin.current && !dragging.current && !hovering.current && stepRef.current === 0 && !reduced && playing) {
        rot.current.v += 0.07;
      }
      for (let i = 0; i < N; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const a = ((((i * base + rot.current.v) % 360) + 360) % 360);
        const f = (Math.cos((a * Math.PI) / 180) + 1) / 2; // 1 = front, 0 = back
        el.style.transform = `translate(-50%, -50%) rotateY(${a}deg) translateZ(${geom.R}px) rotateY(${-a}deg)`;
        el.style.opacity = chosenHidden.current && i === chosenRef.current ? '0' : String(0.28 + 0.72 * f);
        el.style.filter = `brightness(${0.5 + 0.5 * f})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geom.R, reduced, playing, inView]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  }, []);

  const commit = useCallback((n: number) => {
    stepRef.current = n;
    setStep(n);
    setBeat((b) => b + 1);
  }, []);

  const pickScene = useCallback((i: number) => {
    sceneRef.current = i;
    setScene(i);
  }, []);

  /* gold burst where the dress lands */
  const burst = useCallback(() => {
    const dots = burstRef.current?.children;
    if (!dots) return;
    Array.from(dots).forEach((dot, i) => {
      const a = (i / dots.length) * Math.PI * 2 + Math.random() * 0.6;
      const r = 70 + Math.random() * 90;
      gsap.fromTo(
        dot,
        { x: 0, y: 0, scale: 1, autoAlpha: 1 },
        { x: Math.cos(a) * r, y: Math.sin(a) * r, scale: 0, autoAlpha: 0, duration: 0.8 + Math.random() * 0.35, ease: 'power3.out' },
      );
    });
  }, []);

  /* the shutter — a flash over the stage and a quick settle on the frame; every change is a picture being taken */
  const shutter = useCallback(() => {
    if (reduced) return;
    const flash = flashRef.current;
    const model = modelRef.current;
    if (flash) gsap.fromTo(flash, { autoAlpha: 0.75 }, { autoAlpha: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
    if (model) gsap.fromTo(model, { scale: 1.035 }, { scale: 1, duration: 0.8, ease: 'power3.out', overwrite: 'auto' });
  }, [reduced]);

  /* the flight — spin the chosen piece to the front, lift it off the rail, land it on the model */
  const runFlight = useCallback(() => {
    const stage = stageRef.current;
    const ci = chosenRef.current;
    const card = cardRefs.current[ci];
    const clone = cloneRef.current;
    const slot = modelSlotRef.current;
    const model = modelRef.current;
    const mann = mannequinRef.current;
    const wrap = ringWrapRef.current;
    const shimmer = shimmerRef.current;

    if (reduced || !stage || !card || !clone || !slot || !model || !mann || !wrap || !shimmer) {
      chosenHidden.current = true;
      spin.current = false;
      if (wrap) gsap.set(wrap, RING_BACK);
      if (model) gsap.set(model, { autoAlpha: 1, scale: 1, clearProps: 'clipPath' });
      commit(2);
      return;
    }

    anim.current?.kill();
    spin.current = false;
    const base = 360 / DRESSES.length;
    const want = -ci * base;
    const cur = rot.current.v;
    const target = want + Math.round((cur - want) / 360) * 360;

    gsap.set(wrap, RING_FRONT);
    gsap.set(model, { autoAlpha: 0, clearProps: 'clipPath' });
    gsap.set(mann, { autoAlpha: 0 });
    gsap.set(clone, { autoAlpha: 0 });

    anim.current = gsap.to(rot.current, {
      v: target,
      duration: 0.9,
      ease: 'power2.inOut',
      onComplete: () => {
        const sr = stage.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        const tr = slot.getBoundingClientRect();
        const x0 = cr.left - sr.left;
        const y0 = cr.top - sr.top;
        const sc = (tr.width * 0.98) / cr.width;
        const tx = tr.left - sr.left + tr.width / 2 - cr.width / 2;
        const ty = tr.top - sr.top + tr.height / 2 - cr.height / 2;

        gsap.set(clone, {
          x: x0,
          y: y0,
          width: cr.width,
          height: cr.height,
          scale: 1,
          rotation: 0,
          autoAlpha: 1,
          transformOrigin: '50% 50%',
          boxShadow: '0 0 0 0 rgba(200,168,122,0)',
        });
        chosenHidden.current = true;

        const fly = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onComplete: () => commit(2) });
        anim.current = fly;
        // the spotlight finds it
        fly.to(clone, { boxShadow: '0 0 70px 8px rgba(200,168,122,0.55)', duration: 0.4, ease: 'power2.out' }, 0);
        // the closet recedes behind you
        fly.to(wrap, { ...RING_BACK, duration: 1.2, ease: 'power2.out' }, 0);
        // the form appears
        fly.fromTo(mann, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.5 }, 0.1);
        // lift, arc, land
        fly.to(clone, { y: y0 - 48, rotation: -7, scale: 1.08, duration: 0.38, ease: 'power2.out' }, 0);
        fly.to(clone, { x: (x0 + tx) / 2, y: Math.min(y0, ty) - 120, rotation: 9, scale: 1.22, duration: 0.5 }, 0.38);
        fly.to(clone, { x: tx, y: ty, rotation: 0, scale: sc, duration: 0.62, ease: 'power3.inOut' }, 0.88);
        fly.to(clone, { boxShadow: '0 0 0 0 rgba(200,168,122,0)', duration: 0.5 }, 1.0);
        // touchdown — sparks, the form dissolves, the real picture irises out from where the dress landed
        fly.add(burst, 1.32);
        fly.to(mann, { autoAlpha: 0, duration: 0.25 }, 1.35);
        fly.fromTo(
          model,
          { autoAlpha: 1, scale: 1, clipPath: 'circle(0% at 50% 42%)' },
          { clipPath: 'circle(100% at 50% 42%)', duration: 0.8, ease: 'power2.out', clearProps: 'clipPath' },
          1.38,
        );
        fly.to(clone, { autoAlpha: 0, scale: sc * 1.06, duration: 0.3, ease: 'power1.in' }, 1.5);
        fly.fromTo(shimmer, SHIMMER_FROM, SHIMMER_TO, 1.6);
      },
    });
  }, [reduced, commit, burst]);

  const go = useCallback(
    (n: number) => {
      clearTimers();
      anim.current?.kill();
      anim.current = null;
      const wrap = ringWrapRef.current;
      const model = modelRef.current;
      const mann = mannequinRef.current;
      const clone = cloneRef.current;

      if (n === 0) {
        chosenHidden.current = false;
        spin.current = true;
        pickScene(0);
        if (clone) gsap.set(clone, { autoAlpha: 0 });
        if (mann) gsap.set(mann, { autoAlpha: 0 });
        if (model) gsap.to(model, { autoAlpha: 0, duration: 0.3, clearProps: 'clipPath' });
        if (wrap) gsap.to(wrap, { ...RING_FRONT, duration: 0.7, ease: 'power2.out' });
        commit(0);
        return;
      }
      if (n === 1) {
        chosenHidden.current = false;
        commit(1);
        runFlight();
        return;
      }
      // 2..5 — straight to the worn state
      chosenHidden.current = true;
      spin.current = false;
      if (clone) gsap.set(clone, { autoAlpha: 0 });
      if (mann) gsap.set(mann, { autoAlpha: 0 });
      if (wrap) gsap.to(wrap, { ...RING_BACK, duration: 0.6, ease: 'power2.out' });
      if (model) gsap.to(model, { autoAlpha: 1, scale: 1, duration: 0.4, clearProps: 'clipPath' });
      if (n === 3 && stepRef.current !== 3) pickScene(0);
      commit(n);
    },
    [clearTimers, commit, runFlight, pickScene],
  );

  /* every programmatic step is a scroll, so progress stays the single source of truth (immediate, so no beat flickers past) */
  const jumpTo = useCallback((b: number) => {
    const st = stRef.current;
    if (!st) return;
    const target = Math.max(0, Math.min(BEATS - 1, b));
    const y = st.start + ((target + 0.5) / BEATS) * (st.end - st.start);
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (lenis) lenis.scrollTo(y, { immediate: true });
    else window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
  }, []);

  /* tap a card on the rail — that piece flies instead of tonight's pick */
  const pick = useCallback(
    (i: number) => {
      chosenRef.current = i;
      setChosen(i);
      jumpTo(1);
    },
    [jumpTo],
  );

  /* same spot, different piece — the new look wipes down over the old one under a flash */
  const swap = useCallback(
    (i: number) => {
      if (i === chosenRef.current) return;
      chosenRef.current = i;
      setChosen(i);
      shutter();
      const shimmer = shimmerRef.current;
      if (shimmer && !reduced) gsap.fromTo(shimmer, SHIMMER_FROM, { ...SHIMMER_TO, delay: 0.3 });
      commit(stepRef.current); // re-arm the dwell
    },
    [shutter, commit, reduced],
  );

  /* scroll → beat → stage. Idempotent, so a long flick lands cleanly and walking back never replays the flight. */
  const applyBeat = useCallback(
    (b: number, from: number) => {
      const s = stepRef.current;
      if (b === 0) {
        if (s !== 0) go(0);
      } else if (b === 1) {
        if (s === 1 || s === 2) return;
        go(from < 1 ? 1 : 2); // forward: the flight. Backing in from the scenes: it's already on you.
      } else if (b <= 7) {
        const sc = b - 2;
        if (s === 3 && sceneRef.current === sc) return;
        if (s !== 3) go(3);
        pickScene(sc);
      } else if (b === 8) {
        if (s !== 4) go(4);
      } else if (s !== 5) go(5);
    },
    [go, pickScene],
  );
  const applyBeatRef = useRef(applyBeat);
  applyBeatRef.current = applyBeat;

  /* the stage pins and the page scroll walks the beats; autoplay walks the same scroll, so a wheel only gets you there sooner */
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.round(Math.max(320, window.innerHeight * 0.55) * BEATS)}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onToggle: (self) => setPinned(self.isActive),
      onUpdate: (self) => {
        const b = beatOf(self.progress);
        if (b === beatRef.current) return;
        const from = beatRef.current;
        beatRef.current = b;
        applyBeatRef.current(b, from);
      },
    });
    stRef.current = st;
    return () => {
      st.kill();
      stRef.current = null;
    };
  }, []);

  /* autoplay — each beat hands off to the next at its own pace (the flight hands off by itself; the last panel holds) */
  useEffect(() => {
    clearTimers();
    if (!playing || !active || reduced) return;
    const dwell = STEPS[step].dwell;
    if (!dwell || step === 1) return;
    timers.current.push(window.setTimeout(() => jumpTo(beatRef.current + 1), dwell));
    return clearTimers;
  }, [step, scene, beat, playing, active, reduced, jumpTo, clearTimers]);

  /* keys walk the beats too while the stage is pinned; at either end they fall through to the page */
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const b = beatRef.current;
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (fwd && b < BEATS - 1) {
        e.preventDefault();
        jumpTo(b + 1);
      } else if (back && b > 0) {
        e.preventDefault();
        jumpTo(b - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, jumpTo]);

  /* drag to spin the rail; a clean tap picks a piece */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stepRef.current !== 0) return;
    dragging.current = true;
    const hit = (e.target as HTMLElement).closest('[data-idx]') as HTMLElement | null;
    drag.current = {
      x0: e.clientX,
      r0: rot.current.v,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
      moved: false,
      idx: hit ? Number(hit.dataset.idx) : -1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const d = drag.current;
    d.v = (e.clientX - d.lastX) / Math.max(1, now - d.lastT);
    d.lastX = e.clientX;
    d.lastT = now;
    if (Math.abs(e.clientX - d.x0) > 6) d.moved = true;
    rot.current.v = d.r0 + (e.clientX - d.x0) * 0.32;
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const v = drag.current.v * 0.32 * 16; // deg per frame
    if (Math.abs(v) > 0.2) {
      anim.current?.kill();
      anim.current = gsap.to(rot.current, { v: rot.current.v + v * 14, duration: 0.9, ease: 'power2.out' });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    const tap = dragging.current && !d.moved && d.idx >= 0;
    endDrag();
    if (tap) pick(d.idx);
  };

  const base = COPY.steps[step];
  const cap = {
    eyebrow: step >= 2 && step <= 4 ? `${base.eyebrow} · ${dress.short}` : base.eyebrow,
    line: step === 3 ? live.caption : base.line,
    sub: base.sub,
  };
  const capKey = `${step}-${step === 3 ? scene : 0}-${dress.key}`;

  /* caption swap — GSAP, not a keyed presence (a re-keyed presence child stalled at its initial state here) */
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    if (reduced) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    const tw = gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', overwrite: true });
    return () => {
      tw.kill();
    };
  }, [capKey, reduced]);

  /* every location is a picture being taken */
  const snapKey = step >= 3 ? `${step}-${scene}` : '';
  useLayoutEffect(() => {
    if (snapKey) shutter();
  }, [snapKey, shutter]);

  /* keep it — the picture steps aside to make room for the receipt */
  useLayoutEffect(() => {
    const el = slotInnerRef.current;
    if (!el) return;
    const { small, sw, sh, H } = geom;
    const k = step === 4 ? (small ? 0.75 : Math.min(1, Math.max(0.72, (H - 240) / (sh + 140)))) : 1;
    const to =
      step === 4
        ? { scale: k, x: small ? 0 : -(sw * k) / 2 - 20, y: small ? -10 : 0, autoAlpha: 1 }
        : step === 5
          ? { scale: 0.9, x: 0, y: 24, autoAlpha: 0 } // the picture steps out; the next chapter takes the stage
          : { scale: 1, x: 0, y: 0, autoAlpha: 1 };
    if (reduced) {
      gsap.set(el, to);
      return;
    }
    gsap.to(el, { ...to, duration: 0.75, ease: 'power3.inOut' });
  }, [step, geom, reduced]);

  const dwellSec = STEPS[step].dwell / 1000;
  const ringW = geom.R * 2 + geom.w;
  const ringH = geom.h + 40;
  const drift = scene % 2 ? 1.5 : -1.5;

  /* the two rails beside the picture — pieces to swap in, places to shoot */
  const swatch = (d: Dress, i: number, size: string) => {
    const on = i === chosen;
    return (
      <button
        key={d.key}
        type="button"
        aria-pressed={on}
        aria-label={`Wear the ${d.short.toLowerCase()}`}
        onClick={() => swap(i)}
        className={`${size} shrink-0 overflow-hidden rounded-full ring-2 transition-all duration-300 ${
          on
            ? 'scale-110 ring-worn-gold shadow-[0_0_22px_rgba(200,168,122,0.5)]'
            : 'ring-worn-paper/25 opacity-70 hover:scale-105 hover:opacity-100'
        }`}
      >
        <img src={d.img} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" style={{ objectPosition: '50% 28%' }} />
      </button>
    );
  };
  const thumb = (s: Scene, i: number, size: string, label: boolean) => {
    const on = i === scene;
    return (
      <button
        key={s.id}
        type="button"
        aria-pressed={on}
        aria-label={`See the ${s.label.toLowerCase()} scene`}
        onClick={() => jumpTo(2 + i)}
        className="group flex items-center gap-2.5 text-left"
      >
        <span
          className={`${size} block shrink-0 overflow-hidden rounded-md ring-2 transition-all duration-300 ${
            on ? 'scale-110 ring-worn-gold shadow-[0_0_24px_rgba(200,168,122,0.45)]' : 'ring-transparent opacity-55 group-hover:opacity-90'
          }`}
        >
          <img src={render(dress, s.id)} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
        </span>
        {label ? (
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
              on ? 'text-worn-gold' : 'text-worn-paper/50 group-hover:text-worn-paper/80'
            }`}
          >
            {s.label}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <section
      id="grwm"
      ref={sectionRef}
      aria-label="The drop — browse the feed, try it on, haul it with coins, unbox the reveal"
      className="relative bg-[#0c0b09] text-worn-paper"
    >
      <div ref={stageRef} className="relative h-[100svh] min-h-[560px] overflow-hidden">
        {/* backdrop — the closet, then the actual location behind you (the new one fades in over the old, no dip) */}
        <AnimatePresence initial={false}>
          {step >= 3 ? (
            <motion.div
              key={`${dress.key}-${live.id}`}
              aria-hidden="true"
              className="absolute inset-0 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.9 } }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            >
              <motion.img
                src={render(dress, live.id)}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: 'blur(24px) saturate(1.15)' }}
                initial={{ scale: 1.18, x: `${-drift}%` }}
                animate={reduced ? { scale: 1.18, x: `${-drift}%` } : { scale: 1.28, x: `${drift}%` }}
                transition={{ duration: 8, ease: 'linear' }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(12,11,9,0.62) 0%, rgba(12,11,9,0.3) 45%, rgba(12,11,9,0.78) 100%)',
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="closet"
              aria-hidden="true"
              className="absolute inset-0"
              style={{ background: CLOSET_BG }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.6, delay: 0.6 } }}
              transition={{ duration: 0.9 }}
            />
          )}
        </AnimatePresence>
        <GoldParticles density={36} />
        {/* the last panel reads over any scene: veil the stage behind it */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[15] bg-[#0c0b09]"
          initial={false}
          animate={{ opacity: step === 5 ? 0.6 : 0 }}
          transition={{ duration: 0.6 }}
        />

        {/* captions */}
        <div
          className="absolute left-1/2 top-[8%] z-30 w-full max-w-[760px] -translate-x-1/2 px-5 text-center"
          aria-live="polite"
        >
          <p className="font-mono text-micro uppercase tracking-[0.3em] text-worn-gold">{step === 5 ? COPY.kickerMore : COPY.kicker}</p>
          <div ref={capRef} className="mt-3">
            <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-paper/60">
              {STEPS[step].n} — {cap.eyebrow}
            </p>
            <p className="mt-2 font-display text-[clamp(22px,2.8vw,34px)] leading-tight text-worn-paper">{cap.line}</p>
            {cap.sub ? (
              <p className="mt-2 font-mono text-[12px] uppercase tracking-[0.2em] text-worn-gold/80">{cap.sub}</p>
            ) : null}
          </div>
        </div>

        {/* the closet carousel */}
        <div
          ref={ringWrapRef}
          className="absolute z-10 will-change-transform"
          style={{ left: '50%', top: '46%', width: ringW, height: ringH, marginLeft: -ringW / 2, marginTop: -ringH / 2 }}
        >
          {/* the rail */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-0 rounded-pill"
            style={{
              height: 9,
              background: 'linear-gradient(180deg, #e4d6bf, #9c8464 55%, #4a3d2d)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
            }}
          />
          {/* the floor track */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[64%] -translate-x-1/2 rounded-[50%] border border-worn-gold/15"
            style={{ width: geom.R * 2, height: geom.R * 0.46 }}
          />
          {/* the ring */}
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            style={{ perspective: 1400, touchAction: 'pan-y' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={endDrag}
            onPointerEnter={() => (hovering.current = true)}
            onPointerLeave={() => {
              hovering.current = false;
              endDrag();
            }}
          >
            <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
              {DRESSES.map((d, i) => {
                const a0 = (i * 360) / DRESSES.length;
                return (
                  <div
                    key={d.key}
                    data-idx={i}
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    className="absolute left-1/2 top-1/2 select-none will-change-transform"
                    style={{
                      transform: `translate(-50%, -50%) rotateY(${a0}deg) translateZ(${geom.R}px) rotateY(${-a0}deg)`,
                    }}
                  >
                    <DressCard d={d} w={geom.w} h={geom.h} eager={i === DROP} interactive />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* the model */}
        <div
          ref={modelSlotRef}
          className="absolute left-1/2 top-[54%] z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ width: geom.sw, height: geom.sh }}
        >
          <div ref={slotInnerRef} className="absolute inset-0 will-change-transform">
            <motion.div
              aria-hidden="true"
              className="absolute left-1/2 top-[97%] h-10 w-[120%] -translate-x-1/2 rounded-[50%] blur-xl"
              animate={{ backgroundColor: step >= 3 ? live.floor : 'rgba(200,168,122,0.14)' }}
              transition={{ duration: 0.9 }}
            />
            <div ref={mannequinRef} className="absolute inset-0" style={{ opacity: 0 }}>
              <Mannequin className="h-full w-full" />
            </div>

            {/* keep it — the picture becomes the post */}
            <AnimatePresence>
              {step === 4 ? (
                <motion.div
                  key="post"
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="absolute -inset-x-2 -bottom-[92px] -top-12 rounded-xl bg-worn-paper shadow-pop"
                >
                  <div className="absolute inset-x-0 top-0 flex h-12 items-center gap-2.5 px-3 text-worn-ink">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,#c8a87a,#f5d9a8,#9c7a4e,#c8a87a)] p-[2px]">
                      <img
                        src={render(dress, 'studio')}
                        alt=""
                        draggable={false}
                        className="h-full w-full rounded-full object-cover"
                        style={{ objectPosition: '50% 8%' }}
                      />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block font-sans text-[12px] font-semibold">you</span>
                      <span className="flex items-center gap-1 font-sans text-[10px] text-worn-ink/60">
                        <MapPin size={9} /> {live.label}
                      </span>
                    </span>
                    <MoreHorizontal size={16} className="text-worn-ink/60" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-2 text-worn-ink">
                    <div className="flex items-center gap-3">
                      <Heart size={18} className="fill-[#ed4956] text-[#ed4956]" />
                      <MessageCircle size={18} />
                      <Send size={18} />
                      <Bookmark size={18} className="ml-auto" />
                    </div>
                    <p className="mt-1.5 font-sans text-[12px] font-semibold">
                      Sample post · yours to share
                    </p>
                    <p className="truncate font-sans text-[12px]">
                      <span className="font-semibold">you</span> hauled it. wore it.{' '}
                      <span className="text-worn-gold-deep">#worn {dress.tag}</span>
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-worn-ink/50">
                      Just now · 0 parcels · 0 returns
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div
              ref={modelRef}
              className="absolute inset-0 overflow-hidden rounded-card shadow-[0_60px_120px_-20px_rgba(0,0,0,0.75)] ring-1 ring-worn-gold/35"
              style={{ opacity: 0 }}
            >
              {/* one avatar, one piece, six looks. A new piece wipes down over the old; a new look fades in on top. */}
              <AnimatePresence initial={false}>
                <motion.div
                  key={dress.key}
                  className="absolute inset-0"
                  initial={{ clipPath: 'inset(0px 0px 100% 0px)' }}
                  animate={{ clipPath: 'inset(0px 0px 0% 0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.3, delay: 1.2 } }}
                  transition={{ duration: reduced ? 0 : 0.75, ease: EASE }}
                >
                  {LOOKS.map((look) => {
                    const on = step >= 3 ? look === live.id : look === 'studio';
                    const where = SCENES.find((s) => s.id === look);
                    return (
                      <motion.img
                        key={look}
                        src={render(dress, look)}
                        alt={where ? `${dress.short} on your avatar, ${where.label.toLowerCase()}` : `${dress.short} on your avatar`}
                        aria-hidden={!on}
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                        initial={false}
                        animate={{ opacity: on ? 1 : 0 }}
                        transition={on ? { duration: 0.7, ease: 'easeInOut' } : { duration: 0.3, delay: 1 }}
                        style={{ zIndex: on ? 2 : 1 }}
                      />
                    );
                  })}
                </motion.div>
              </AnimatePresence>
              <div
                ref={shimmerRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-[3] w-[45%]"
                style={{ opacity: 0, background: 'linear-gradient(90deg, transparent, rgba(255,240,210,0.55), transparent)' }}
              />
              <AnimatePresence>
                {step >= 2 && step < 4 ? (
                  <motion.div
                    key="match"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="glass-dark absolute bottom-3 left-3 z-[3] flex items-center gap-2 rounded-pill px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-worn-paper"
                  >
                    <ScanFace size={12} className="text-worn-gold" /> {geom.small ? 'Try-on preview' : `Try-on preview · size ${dress.size}`}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* landing burst */}
            <div ref={burstRef} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-30">
              {Array.from({ length: BURST }).map((_, i) => (
                <span key={i} className="absolute -ml-[3px] -mt-[3px] block h-1.5 w-1.5 rounded-full bg-worn-gold" style={{ opacity: 0 }} />
              ))}
            </div>
          </div>
        </div>

        {/* desktop — the outfit rail on the left, the location strip on the right */}
        {!geom.small ? (
          <>
            <AnimatePresence>
              {step === 2 || step === 3 ? (
                <motion.div
                  key="outfits"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="absolute top-[54%] z-30 flex flex-col items-center gap-2.5"
                  style={{ right: `calc(50% + ${geom.sw / 2 + 26}px)`, y: '-50%' }}
                >
                  <span className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-worn-paper/50">Outfit</span>
                  {DRESSES.map((d, i) => swatch(d, i, 'h-10 w-10'))}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {step === 3 ? (
                <motion.div
                  key="scenes"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="absolute top-[54%] z-30 flex flex-col gap-2"
                  style={{ left: `calc(50% + ${geom.sw / 2 + 26}px)`, y: '-50%' }}
                >
                  {SCENES.map((s, i) => thumb(s, i, 'h-14 w-10', true))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}

        {/* keep it — the receipt beside the post (desktop) */}
        <AnimatePresence>
          {step === 4 && !geom.small ? (
            <motion.aside
              key="receipt"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.55, delay: 0.25, ease: EASE }}
              className="glass-dark absolute left-1/2 top-[54%] z-30 w-[272px] rounded-card p-5"
              style={{ y: '-50%', marginLeft: 16 }}
            >
              <p className="font-mono text-micro uppercase tracking-[0.25em] text-worn-gold">The receipt</p>
              <ul className="mt-3 space-y-2.5 font-sans text-[13px] text-worn-paper/85">
                <li className="flex items-center gap-2">
                  <Check size={14} className="shrink-0 text-worn-gold" /> Saved to your lookbook
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles size={14} className="shrink-0 text-worn-gold" /> 2 free scenes · 4 at 50 coins
                </li>
                <li className="flex items-center gap-2">
                  <Camera size={14} className="shrink-0 text-worn-gold" /> 6 scenes · 1 piece · 0 parcels
                </li>
              </ul>
              <a
                href="#download"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-worn-paper px-5 py-2.5 font-sans text-[13px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint"
              >
                Request early access <ArrowRight size={14} />
              </a>
              <button
                type="button"
                onClick={() => jumpTo(0)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-pill border border-worn-paper/25 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-worn-paper/70 transition-colors hover:border-worn-gold hover:text-worn-paper"
              >
                <RefreshCcw size={11} /> Back to the feed
              </button>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {/* there's more — the next chapter, for the clothes you already bought */}
        <AnimatePresence>
          {step === 5 ? (
            <motion.div
              key="more"
              initial={{ opacity: 0, y: '-46%' }}
              animate={{ opacity: 1, y: '-50%' }}
              exit={{ opacity: 0 }}
              style={{ x: '-50%' }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
              className="glass-dark absolute left-1/2 top-[54%] z-30 w-[min(92vw,560px)] rounded-card p-6 text-center sm:p-9"
            >
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-worn-gold/50 bg-worn-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-worn-gold">
                <Sparkles size={11} /> Coming after Worn Play
              </span>
              <h3 className="mt-4 font-display text-[clamp(24px,3.2vw,38px)] leading-[1.05] text-worn-paper">
                For the clothes you <em className="text-worn-gold">already</em> bought.
              </h3>
              <p className="mx-auto mt-3 max-w-[46ch] font-sans text-[14px] leading-relaxed text-worn-paper/75 sm:text-[15px]">
                Two hundred pieces, twenty in rotation, nothing to wear at 8 AM. Worn Closet catalogs what you own from your
                order emails, plans your week, tracks cost per wear and finds the gift cards, warranties and resale money
                sleeping in your wardrobe.
              </p>
              <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
                {CLOSET_POINTS.map((p) => (
                  <li
                    key={p}
                    className="rounded-pill border border-worn-paper/15 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-worn-paper/65"
                  >
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <a
                  href="/closet"
                  className="inline-flex items-center gap-2 rounded-pill bg-worn-paper px-5 py-2.5 font-sans text-[13px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint"
                >
                  Explore Worn Closet <ArrowRight size={14} />
                </a>
                <a
                  href="#download"
                  className="inline-flex items-center gap-2 rounded-pill border border-worn-paper/25 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-worn-paper/80 transition-colors hover:border-worn-gold hover:text-worn-paper"
                >
                  Request early access
                </a>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* the flying piece */}
        <DressCard
          d={dress}
          w={geom.w}
          h={geom.h}
          eager
          cardRef={(el) => {
            cloneRef.current = el;
          }}
          className="pointer-events-none absolute left-0 top-0 z-30"
          style={{ opacity: 0 }}
        />

        {/* the shutter */}
        <div ref={flashRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[25] bg-[#fff6e6]" style={{ opacity: 0 }} />

        {/* mobile — both rails stack under the picture; keep-it row lives here too */}
        {geom.small ? (
          <div className="absolute bottom-[13%] left-1/2 z-30 flex w-full -translate-x-1/2 flex-col items-center gap-3 px-4">
            <AnimatePresence mode="wait">
              {step === 3 ? (
                <motion.div
                  key="rails"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center gap-2.5"
                >
                  <div className="flex items-center gap-2">{DRESSES.map((d, i) => swatch(d, i, 'h-8 w-8'))}</div>
                  <div className="flex items-center gap-1.5">{SCENES.map((s, i) => thumb(s, i, 'h-12 w-8', false))}</div>
                </motion.div>
              ) : step === 4 ? (
                <motion.div
                  key="keep"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, delay: 0.15 }}
                  className="flex flex-wrap items-center justify-center gap-2"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-pill border border-worn-gold/50 bg-worn-gold/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-worn-gold">
                    <Sparkles size={12} /> 2 free scenes · 0 parcels
                  </span>
                  <a
                    href="#download"
                    className="inline-flex items-center gap-2 rounded-pill bg-worn-paper px-5 py-2.5 font-sans text-[13px] font-semibold text-worn-ink transition-colors hover:bg-worn-gold-tint"
                  >
                    Request early access <ArrowRight size={14} />
                  </a>
                  {/* icon only here, so it shares the CTA's line instead of pushing the row up into the post */}
                  <button
                    type="button"
                    onClick={() => jumpTo(0)}
                    aria-label="Back to the feed"
                    title="Back to the feed"
                    className="grid h-11 w-11 place-items-center rounded-full border border-worn-paper/25 text-worn-paper/70 transition-colors hover:border-worn-gold hover:text-worn-paper"
                  >
                    <RefreshCcw size={14} />
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        {/* controls — phones get 44px targets: the six steps and play; prev/next join from sm up */}
        <div className="glass-dark absolute inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-1 rounded-pill p-1.5">
          <button
            type="button"
            onClick={() => jumpTo(beatRef.current - 1)}
            aria-label="Previous step"
            className="hidden h-9 w-9 place-items-center rounded-full text-worn-paper/70 transition-colors hover:text-worn-gold sm:grid"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => jumpTo(STEP_BEAT[i])}
                aria-pressed={i === step}
                className={`relative min-h-[44px] min-w-[44px] overflow-hidden whitespace-nowrap rounded-pill px-2 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors sm:min-h-0 sm:min-w-0 sm:px-3 ${
                  i === step ? 'bg-worn-paper/10 text-worn-paper' : 'text-worn-paper/70 hover:text-worn-paper'
                }`}
              >
                <span className="text-worn-gold lg:mr-1.5">{s.n}</span>
                <span className="hidden lg:inline">{s.label}</span>
                {i === step ? (
                  <motion.span
                    key={`${step}-${scene}-${beat}-${playing}-${active}`}
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0.5 h-px origin-left bg-worn-gold"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: playing && active && dwellSec > 0 ? 1 : 0 }}
                    transition={{ duration: dwellSec, ease: 'linear' }}
                  />
                ) : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => jumpTo(beatRef.current + 1)}
            aria-label="Next step"
            className="hidden h-9 w-9 place-items-center rounded-full text-worn-paper/70 transition-colors hover:text-worn-gold sm:grid"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
            className="ml-1 grid h-11 w-11 place-items-center rounded-full bg-worn-gold text-worn-ink transition-transform active:scale-95 sm:h-9 sm:w-9"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="hidden items-center gap-1.5 whitespace-nowrap pl-2 pr-3 font-mono text-[12px] uppercase tracking-[0.18em] text-worn-paper/70 xl:inline-flex">
            <Mouse size={13} /> Scroll to step through
          </span>
        </div>
      </div>
    </section>
  );
}
