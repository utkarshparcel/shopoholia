'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
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

type Piece = {
  name: string;
  short: string;
  src: string;
  /** Intrinsic size of the cut-out, so its box is reserved before it loads. */
  w: number;
  h: number;
  /** Sample wear numbers for the tag. */
  worn: number;
  perWear: number;
  last: string;
  /** Where it sits on her, as % of the mirror photo. */
  on: [number, number];
};

const PIECES = {
  sage: { name: 'Sage ruched mini', short: 'Sage mini', src: '/closet/piece-sage.webp', w: 379, h: 588, worn: 13, perWear: 200, last: '9 days ago', on: [47, 39] },
  blackknit: { name: 'Black knit midi', short: 'Knit midi', src: '/closet/piece-blackknit.webp', w: 392, h: 642, worn: 11, perWear: 200, last: '2 weeks ago', on: [47, 42] },
  linen: { name: 'Cream linen midi', short: 'Linen midi', src: '/closet/piece-linen.webp', w: 409, h: 654, worn: 4, perWear: 650, last: 'in August', on: [47, 45] },
  tee: { name: 'White tee', short: 'White tee', src: '/closet/piece-tee.webp', w: 513, h: 489, worn: 45, perWear: 13, last: '5 days ago', on: [47, 28] },
  trousers: { name: 'Beige wide-leg linen', short: 'Wide-legs', src: '/closet/piece-trousers.webp', w: 394, h: 635, worn: 9, perWear: 233, last: '3 weeks ago', on: [49, 68] },
  slip: { name: 'Black satin slip', short: 'Satin slip', src: '/closet/piece-slip.webp', w: 320, h: 677, worn: 3, perWear: 1067, last: 'in May', on: [47, 44] },
  wedges: { name: 'Tan espadrille wedges', short: 'Tan wedges', src: '/closet/piece-wedges.webp', w: 572, h: 471, worn: 31, perWear: 77, last: 'Saturday', on: [52, 93] },
  hoops: { name: 'Gold hoops', short: 'Gold hoops', src: '/closet/piece-hoops.webp', w: 230, h: 110, worn: 58, perWear: 16, last: 'yesterday', on: [43, 12] },
  bag: { name: 'Straw shoulder bag', short: 'Straw bag', src: '/closet/piece-bag.webp', w: 293, h: 598, worn: 22, perWear: 55, last: '4 days ago', on: [31, 54] },
  clip: { name: 'Tortoiseshell claw clip', short: 'Claw clip', src: '/closet/piece-clip.webp', w: 264, h: 195, worn: 40, perWear: 9, last: 'last week', on: [48, 5] },
  clutch: { name: 'Gold clutch', short: 'Gold clutch', src: '/closet/piece-clutch.webp', w: 478, h: 340, worn: 7, perWear: 214, last: 'in June', on: [31, 54] },
  drops: { name: 'Gold drop earrings', short: 'Gold drops', src: '/closet/piece-drops.webp', w: 223, h: 195, worn: 5, perWear: 180, last: 'in June', on: [43, 12] },
} satisfies Record<string, Piece>;

type PieceKey = keyof typeof PIECES;

// The desktop scene is laid out in 1120 × 700 units and scales with the page.
const SW = 1120;
const SH = 700;
const px = (v: number) => `${(v / SW) * 100}%`;
const py = (v: number) => `${(v / SH) * 100}%`;
// Below 1120 wide (short screens cap the scene), tags and cards shrink with the board instead of crowding it.
const fit: CSSProperties = { scale: 'var(--k)', transformOrigin: '0 0' };
const fitCard: CSSProperties = { ...fit, width: 'calc(100% / var(--k))' };

/** A piece on the board, in scene units. `main` gets the full wear tag. */
type Laid = { p: PieceKey; x: number; y: number; w: number; r?: number; main?: boolean };

type Look = {
  id: 'planned' | 'hair' | 'bloat' | 'wax' | 'party';
  chip: string;
  mirror: string;
  alt: string;
  note: string;
  laid: Laid[];
  noteY: number;
  poll?: boolean;
};

const LOOKS: Look[] = [
  {
    id: 'planned',
    chip: 'As planned',
    mirror: '/closet/mirror-planned.webp',
    alt: 'Mirror selfie in a sage ruched strapless mini dress and tan espadrille wedges',
    note: 'Sage and tan, same warmth. Gold hoops because the neckline’s bare.',
    laid: [
      { p: 'hoops', x: 530, y: 60, w: 70 },
      { p: 'sage', x: 500, y: 140, w: 176, main: true },
      { p: 'wedges', x: 504, y: 500, w: 160, r: -4 },
      { p: 'bag', x: 905, y: 64, w: 110, r: 4 },
    ],
    noteY: 400,
  },
  {
    id: 'hair',
    chip: 'Bad hair day',
    mirror: '/closet/mirror-hair.webp',
    alt: 'Mirror selfie with hair up in a bun and a black long-sleeve knit midi dress',
    note: 'Hair goes up in the claw clip, so the neckline does the talking. Black knit, nothing fussy.',
    laid: [
      { p: 'clip', x: 530, y: 50, w: 76, r: -12 },
      { p: 'blackknit', x: 504, y: 140, w: 168, main: true },
      { p: 'wedges', x: 504, y: 500, w: 160, r: -4 },
      { p: 'bag', x: 905, y: 64, w: 110, r: 4 },
    ],
    noteY: 400,
  },
  {
    id: 'bloat',
    chip: 'Bloated',
    mirror: '/closet/mirror-bloat.webp',
    alt: 'Mirror selfie in a loose cream linen midi dress',
    note: 'Nothing at the waist today. Cream linen falls from the shoulder, and the wedges keep it dressed.',
    laid: [
      { p: 'hoops', x: 530, y: 60, w: 70 },
      { p: 'linen', x: 500, y: 140, w: 172, main: true },
      { p: 'wedges', x: 504, y: 500, w: 160, r: -4 },
      { p: 'bag', x: 905, y: 64, w: 110, r: 4 },
    ],
    noteY: 400,
  },
  {
    id: 'wax',
    chip: 'Not waxed',
    mirror: '/closet/mirror-wax.webp',
    alt: 'Mirror selfie in a white tee tucked into beige wide-leg linen trousers',
    note: 'Floor-length linen and a crisp tee. It reads as a choice, not a cover-up.',
    laid: [
      { p: 'tee', x: 506, y: 46, w: 150, r: -3 },
      { p: 'trousers', x: 516, y: 228, w: 140, main: true },
      { p: 'wedges', x: 504, y: 500, w: 160, r: -4 },
      { p: 'hoops', x: 925, y: 84, w: 70 },
    ],
    noteY: 420,
  },
  {
    id: 'party',
    chip: 'Party or date',
    mirror: '/closet/mirror-party.webp',
    alt: 'Mirror selfie in a black satin slip midi dress',
    note: 'Black satin after six. Gold drops, the clutch, and the same wedges, so it’s dinner, not a gala.',
    laid: [
      { p: 'drops', x: 532, y: 54, w: 56 },
      { p: 'slip', x: 512, y: 160, w: 150, main: true },
      { p: 'wedges', x: 504, y: 504, w: 160, r: -4 },
      { p: 'clutch', x: 910, y: 300, w: 136, r: -5 },
    ],
    noteY: 446,
    poll: true,
  },
];

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/* ── The steamed-up mirror ──────────────────────────────────────────── */

const loaded = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    loaded.set(src, p);
  }
  return p;
}

/** A blurred, milky copy of the photo with a scatter of condensation beads. */
function steamFrom(img: HTMLImageElement, w: number, h: number, dpr: number) {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  // Blur by shrinking and stretching back up: canvas filters don't work in Safari.
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w / 10));
  small.height = Math.max(1, Math.round(h / 10));
  small.getContext('2d')!.drawImage(img, 0, 0, small.width, small.height);
  const tiny = document.createElement('canvas');
  tiny.width = Math.max(1, Math.round(w / 26));
  tiny.height = Math.max(1, Math.round(h / 26));
  tiny.getContext('2d')!.drawImage(small, 0, 0, tiny.width, tiny.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, w, h);
  const veil = g.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, 'rgba(248,245,240,0.55)');
  veil.addColorStop(1, 'rgba(248,245,240,0.74)');
  g.fillStyle = veil;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = (0.5 + Math.random() * 1.6) * dpr;
    g.fillStyle = `rgba(120,110,100,${0.05 + Math.random() * 0.06})`;
    g.beginPath();
    g.arc(x, y + r * 0.5, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgba(255,255,255,${0.45 + Math.random() * 0.4})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return out;
}

type Pt = { x: number; y: number };

/** Clears a soft round patch of steam along a stroke. */
function wipe(g: CanvasRenderingContext2D, a: Pt, b: Pt, r: number) {
  g.globalCompositeOperation = 'destination-out';
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.22)));
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    const dab = g.createRadialGradient(x, y, r * 0.3, x, y, r);
    dab.addColorStop(0, 'rgba(0,0,0,0.9)');
    dab.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = dab;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

// The path the cloth takes: back and forth, top to bottom.
const AUTO_PATH: [number, number][] = [
  [0.1, 0.12], [0.9, 0.2], [0.1, 0.36], [0.9, 0.46], [0.1, 0.62], [0.9, 0.72], [0.12, 0.88], [0.9, 0.97],
];

function SteamMirror({ src, alt, onClear }: { src: string; alt: string; onClear: () => void }) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(src);
  const [phase, setPhase] = useState<'clear' | 'steam' | 'wipe'>('clear');
  const shownRef = useRef(src);
  const run = useRef(0);
  const fx = useRef<{ raf: number; timer: ReturnType<typeof setTimeout> | null; w: number; h: number }>({
    raf: 0,
    timer: null,
    w: 0,
    h: 0,
  });
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  const stop = useCallback(() => {
    cancelAnimationFrame(fx.current.raf);
    if (fx.current.timer) clearTimeout(fx.current.timer);
    fx.current.timer = null;
  }, []);

  const finish = useCallback(
    (id: number) => {
      if (id !== run.current) return;
      stop();
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.style.transition = 'opacity 0.5s ease';
      canvas.style.opacity = '0';
      fx.current.timer = setTimeout(() => {
        if (id !== run.current) return;
        canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
        setPhase('clear');
        onClearRef.current();
      }, 520);
    },
    [stop],
  );

  const autoWipe = useCallback(
    (id: number) => {
      const canvas = canvasRef.current;
      if (!canvas || id !== run.current) return;
      const g = canvas.getContext('2d')!;
      const { w, h } = fx.current;
      const t0 = performance.now();
      let prev: Pt | null = null;
      const tick = (now: number) => {
        if (id !== run.current) return;
        const p = Math.min(1, (now - t0) / 1150);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const seg = e * (AUTO_PATH.length - 1);
        const i = Math.min(AUTO_PATH.length - 2, Math.floor(seg));
        const f = seg - i;
        const pt = {
          x: (AUTO_PATH[i][0] + (AUTO_PATH[i + 1][0] - AUTO_PATH[i][0]) * f) * w,
          y: (AUTO_PATH[i][1] + (AUTO_PATH[i + 1][1] - AUTO_PATH[i][1]) * f) * h,
        };
        wipe(g, prev ?? pt, pt, w * 0.17);
        prev = pt;
        if (p < 1) fx.current.raf = requestAnimationFrame(tick);
        else finish(id);
      };
      fx.current.raf = requestAnimationFrame(tick);
    },
    [finish],
  );

  // The cloth wipes the glass on its own once the steam is up.
  const armAuto = useCallback(
    (id: number, ms: number) => {
      if (fx.current.timer) clearTimeout(fx.current.timer);
      fx.current.timer = setTimeout(() => autoWipe(id), ms);
    },
    [autoWipe],
  );

  // Steam up, swap the reflection underneath, then wipe it clear.
  useEffect(() => {
    if (src === shownRef.current) {
      // Back to the reflection still behind the glass (scrolled back before the swap): drop that run.
      if (run.current) finish(++run.current);
      return;
    }
    const id = ++run.current;
    stop();
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (reduced || !canvas || !box) {
      shownRef.current = src;
      setShown(src);
      setPhase('clear');
      onClearRef.current();
      return;
    }
    loadImage(src)
      .then((img) => {
        if (id !== run.current) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(box.clientWidth * dpr));
        const h = Math.max(1, Math.round(box.clientHeight * dpr));
        canvas.width = w;
        canvas.height = h;
        fx.current.w = w;
        fx.current.h = h;
        canvas.style.transition = 'none';
        canvas.style.opacity = '1';
        const steam = steamFrom(img, w, h, dpr);
        const g = canvas.getContext('2d')!;
        setPhase('steam');
        const t0 = performance.now();
        const tick = (now: number) => {
          if (id !== run.current) return;
          const p = Math.min(1, (now - t0) / 750);
          const e = 1 - Math.pow(1 - p, 3);
          g.clearRect(0, 0, w, h);
          g.globalAlpha = Math.min(1, e * 1.5);
          g.drawImage(steam, 0, 0);
          g.globalAlpha = 1;
          // Steam rises from the bottom of the glass.
          const edge = h * (1.15 - e * 1.45);
          const rising = g.createLinearGradient(0, edge - h * 0.32, 0, edge);
          rising.addColorStop(0, 'rgba(0,0,0,0)');
          rising.addColorStop(1, 'rgba(0,0,0,1)');
          g.globalCompositeOperation = 'destination-in';
          g.fillStyle = rising;
          g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = 'source-over';
          if (p < 1) {
            fx.current.raf = requestAnimationFrame(tick);
            return;
          }
          g.clearRect(0, 0, w, h);
          g.drawImage(steam, 0, 0);
          shownRef.current = src;
          setShown(src);
          setPhase('wipe');
          armAuto(id, 300);
        };
        fx.current.raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (id !== run.current) return;
        shownRef.current = src;
        setShown(src);
        setPhase('clear');
        onClearRef.current();
      });
  }, [src, reduced, stop, armAuto, finish]);

  useEffect(() => stop, [stop]);

  // A resize mid-steam would stretch the canvas; just clear it.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(box.clientWidth - width) < 2) return;
      width = box.clientWidth;
      if (phase !== 'clear') finish(run.current);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [phase, finish]);

  return (
    <div ref={boxRef} className="relative aspect-[515/935] overflow-hidden rounded-t-[999px] rounded-b-[4px] bg-worn-warm">
      <img
        src={shown}
        alt={alt}
        draggable={false}
        decoding="async"
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
      {/* Glass sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(118deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.1) 72%, rgba(255,255,255,0) 84%)' }}
      />
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}

/* ── Tags and cards ─────────────────────────────────────────────────── */

function HangTag({ k }: { k: PieceKey }) {
  const p = PIECES[k];
  return (
    <div className="w-max whitespace-nowrap rounded-md border border-worn-rule bg-worn-surface px-3 py-2 shadow-card">
      <p className="text-caption font-semibold leading-tight text-worn-ink">{p.name}</p>
      <p className="mt-1 font-mono text-[12px] leading-snug text-worn-ink-soft">
        Worn {p.worn}× · {rupees(p.perWear)} a wear
      </p>
      <p className="font-mono text-[12px] leading-snug text-worn-muted">Last worn {p.last}</p>
    </div>
  );
}

function NoteCard({ look }: { look: Look }) {
  return (
    <div className="rounded-[6px] bg-worn-surface px-5 py-4 shadow-[0_12px_32px_rgba(15,14,12,0.10)]">
      <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold-deep">Stylist’s note · 7:40 AM</p>
      <p className="mt-2 font-display text-[21px] italic leading-[1.3] text-worn-ink">“{look.note}”</p>
    </div>
  );
}

const POLL = [
  { label: 'Black', img: '/closet/mirror-party.webp', votes: 4 },
  { label: 'Pink', img: '/closet/mirror-pink.webp', votes: 1 },
];

function PollCard() {
  const total = POLL.reduce((s, o) => s + o.votes, 0);
  return (
    <div className="rounded-2xl border border-worn-rule bg-worn-surface p-4 shadow-pop">
      <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-muted">Friend poll · {total} votes</p>
      <p className="mt-1 font-display text-[22px] leading-tight text-worn-ink">Black or pink?</p>
      <div className="mt-3 space-y-2.5">
        {POLL.map((o, i) => (
          <div key={o.label} className="flex items-center gap-3">
            <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-worn-warm">
              <img src={o.img} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: '50% 34%', transform: 'scale(1.9)', transformOrigin: '50% 38%' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between text-caption">
                <span className="font-semibold text-worn-ink">{o.label}</span>
                <span className="font-mono text-worn-muted">{o.votes}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-worn-warm">
                <motion.div
                  className={`h-full rounded-pill ${i === 0 ? 'bg-worn-ink' : 'bg-worn-gold'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(o.votes / total) * 100}%` }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.8, ease: EASE }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── The section ────────────────────────────────────────────────────── */

type Line = { k: string; d: string; bx: number; by: number; sx: number; sy: number };

export function ClosetStylist() {
  const reduced = useReducedMotion();
  const [lookId, setLookId] = useState<Look['id']>('planned');
  const look = LOOKS.find((l) => l.id === lookId)!;
  // Threads show once the mirror has cleared for the look on the board.
  const [clearFor, setClearFor] = useState<Look['id']>('planned');
  const linesOn = clearFor === lookId;
  const [lines, setLines] = useState<Line[]>([]);
  const [box, setBox] = useState({ w: SW, h: SH });
  const sceneRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const pieceEls = useRef<Partial<Record<PieceKey, HTMLImageElement | null>>>({});
  const inView = useInView(sceneRef, { amount: 0.5 });
  // Scrolling walks the looks in order; a chip just scrolls to its look.
  const { trackRef, stickRef, jumpTo } = useScrollSteps(LOOKS.length, (i) => setLookId(LOOKS[i].id));

  const a = reduced
    ? { initial: 'visible' as const }
    : { initial: 'hidden' as const, whileInView: 'visible' as const, viewport: { once: true, margin: '-80px' } as const };

  // Threads from each piece on the board to where it sits on her.
  const measure = useCallback(() => {
    const scene = sceneRef.current;
    const glass = glassRef.current;
    if (!scene || !glass) return;
    const s = scene.getBoundingClientRect();
    if (!s.width) return;
    const m = glass.getBoundingClientRect();
    const next: Line[] = [];
    for (const l of look.laid) {
      const el = pieceEls.current[l.p];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const p = PIECES[l.p];
      const sx = r.left - s.left + r.width * 0.06;
      const sy = r.top - s.top + r.height * 0.5;
      const bx = m.left - s.left + (p.on[0] / 100) * m.width;
      const by = m.top - s.top + (p.on[1] / 100) * m.height;
      const bend = Math.max(60, (sx - bx) * 0.45);
      next.push({ k: l.p, sx, sy, bx, by, d: `M ${sx} ${sy} C ${sx - bend} ${sy}, ${bx + bend} ${by}, ${bx} ${by}` });
    }
    setBox({ w: s.width, h: s.height });
    setLines(next);
  }, [look]);

  useEffect(() => {
    if (!linesOn) return;
    measure();
    const t = setTimeout(measure, 750);
    return () => clearTimeout(t);
  }, [linesOn, measure]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(scene);
    return () => ro.disconnect();
  }, [measure]);

  // Warm the other reflections so a swap never waits on the network.
  useEffect(() => {
    if (!inView) return;
    for (const l of LOOKS) loadImage(l.mirror).catch(() => {});
  }, [inView]);

  const onClear = () => setClearFor(lookId);

  return (
    <section id="stylist" className="relative scroll-mt-24 border-y border-worn-rule bg-[#f7f1e7]">
      {/* Morning light through the window, clipped here so the section can hold a sticky child */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-[20%] -top-[30%] h-[160%] w-[90%] rotate-[16deg] blur-3xl"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,222,160,0.32) 22%, transparent 36%, transparent 44%, rgba(255,222,160,0.26) 58%, transparent 72%)',
          }}
          animate={reduced ? undefined : { x: [0, 40, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="section section-py relative">
        <motion.div {...a} variants={rise} custom={0}>
          <p className="ornament font-mono text-micro uppercase tracking-[0.28em] text-worn-gold-deep">
            Your stylist, in the mirror
          </p>
          <h2 className="mt-6 max-w-[20ch] font-display text-[clamp(32px,4.5vw,56px)] leading-[1.04] tracking-[-0.015em] text-worn-ink text-balance">
            A stylist who only shops <em className="grad-text font-display">your closet.</em>
          </h2>
          <p className="mt-4 max-w-[60ch] text-body-l text-worn-muted">
            Every morning Worn lays out the outfit, the shoes, the bag and the earrings, all things
            you already own, and says why they go together. Bad hair day, bloated, plans changed:
            tell it how today is and it restyles in seconds, the photo in about a minute.
          </p>
        </motion.div>

        {/* Each look gets an equal share of the scroll while the chips and the scene hold still, centred in the window under the header */}
        <div ref={trackRef} className="mt-9">
          <div
            ref={stickRef}
            className="step-stick sticky mx-auto max-w-[560px] lg:mx-0 lg:max-w-[calc((100svh_-_172px)_*_1.6)]"
          >
            {/* How’s today? */}
            <motion.div {...a} variants={rise} custom={0.1} className="flex flex-wrap items-center gap-2">
              <span className="mr-2 font-mono text-micro uppercase tracking-[0.22em] text-worn-muted">How’s today?</span>
              {LOOKS.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === lookId}
                  onClick={() => jumpTo(i)}
                  className={`min-h-[44px] rounded-pill border px-4 text-caption font-semibold transition-colors duration-200 ${
                    l.id === lookId
                      ? 'border-worn-ink bg-worn-ink text-worn-paper'
                      : 'border-worn-rule bg-worn-surface text-worn-ink hover:border-worn-gold'
                  }`}
                >
                  {l.chip}
                </button>
              ))}
            </motion.div>

            <motion.div {...a} variants={rise} custom={0.2}>
              <div
                ref={sceneRef}
                className="relative mt-5 flex items-center gap-3 lg:mt-6 lg:block lg:aspect-[1120/700]"
                style={{ '--k': Math.min(1, box.w / SW) } as CSSProperties}
              >
                {/* The board the stylist lays things out on (desktop) */}
                <div
                  aria-hidden="true"
                  className="absolute hidden overflow-hidden rounded-[22px] border border-worn-rule lg:block"
                  style={{ left: px(468), top: py(18), width: px(640), height: py(668), background: 'linear-gradient(160deg, #fbf7f0 0%, #f1e9dc 100%)' }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(112deg, transparent 18%, rgba(255,246,226,0.85) 30%, transparent 44%, transparent 54%, rgba(255,246,226,0.7) 64%, transparent 78%)',
                      filter: 'blur(14px)',
                    }}
                  />
                </div>
                <span
                  className="absolute right-[2%] top-[5%] z-40 hidden rounded-pill border border-worn-rule bg-worn-surface/90 px-3 py-1 font-mono text-micro uppercase tracking-[0.18em] text-worn-muted lg:block"
                >
                  Sample closet
                </span>

                {/* The mirror */}
                <div className="relative z-10 w-[48%] max-w-[calc((100svh_-_400px)_*_0.56)] shrink-0 lg:absolute lg:left-[3.2%] lg:top-[1.4%] lg:w-[33.6%] lg:max-w-none">
                  <div
                    className="rounded-t-[999px] rounded-b-[8px] p-[10px] shadow-[0_24px_60px_rgba(60,40,20,0.18)]"
                    style={{ background: 'linear-gradient(90deg, #b88f60 0%, #e3c89f 22%, #c9a274 48%, #e8d2ad 74%, #b38a5b 100%)' }}
                  >
                    <div ref={glassRef}>
                      <SteamMirror src={look.mirror} alt={look.alt} onClear={onClear} />
                    </div>
                  </div>
                </div>

                {/* Phones: the pieces beside the mirror */}
                <div className="min-w-0 flex-1 lg:hidden">
                  <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Sample closet</p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.ul
                      key={`m-${look.id}`}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="mt-2.5 space-y-2"
                    >
                      {look.laid.map((l) => {
                        const p = PIECES[l.p];
                        return (
                          <li key={l.p} className="flex items-center gap-2 rounded-xl border border-worn-rule bg-[#fbf7f0] p-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                              <img src={p.src} width={p.w} height={p.h} alt={p.name} loading="lazy" className="max-h-full w-auto max-w-full object-contain" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-caption font-semibold leading-tight text-worn-ink">{p.short}</p>
                              <p className="mt-0.5 font-mono text-[12px] leading-snug text-worn-muted">
                                <span className="block">Worn {p.worn}×</span>
                                <span className="block">{rupees(p.perWear)} a wear</span>
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </motion.ul>
                  </AnimatePresence>
                </div>

                {/* Threads (desktop) */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-20 hidden h-full w-full lg:block"
                  viewBox={`0 0 ${box.w} ${box.h}`}
                  preserveAspectRatio="none"
                >
                  <AnimatePresence>
                    {linesOn
                      ? lines.map((l, i) => (
                          <motion.g
                            key={`${look.id}-${l.k}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.2 } }}
                            transition={{ delay: 0.15 + i * 0.12, duration: 0.3 }}
                          >
                            <motion.path
                              d={l.d}
                              fill="none"
                              stroke="#9c7a4e"
                              strokeOpacity={0.7}
                              strokeWidth={1}
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ delay: 0.15 + i * 0.12, duration: 0.7, ease: EASE }}
                            />
                            <circle cx={l.sx} cy={l.sy} r={2.5} fill="#9c7a4e" />
                            <circle cx={l.bx} cy={l.by} r={5} fill="rgba(255,255,255,0.85)" stroke="#9c7a4e" strokeWidth={1.2} />
                            <circle cx={l.bx} cy={l.by} r={1.8} fill="#9c7a4e" />
                          </motion.g>
                        ))
                      : null}
                  </AnimatePresence>
                </svg>

                {/* Pieces on the board (desktop) */}
                <AnimatePresence>
                  {look.laid.map((l, i) => {
                    const p = PIECES[l.p];
                    return (
                      <motion.div
                        key={l.p}
                        className="absolute z-30 hidden lg:block"
                        initial={reduced ? false : { opacity: 0, y: -16, scale: 1.05, left: px(l.x), top: py(l.y), width: px(l.w), rotate: (l.r ?? 0) - 6 }}
                        animate={{ opacity: 1, y: 0, scale: 1, left: px(l.x), top: py(l.y), width: px(l.w), rotate: l.r ?? 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96, transition: { duration: 0.35, ease: EASE } }}
                        transition={{ delay: reduced ? 0 : 0.25 + i * 0.08, duration: 0.7, ease: EASE }}
                      >
                        <img
                          ref={(el) => {
                            pieceEls.current[l.p] = el;
                          }}
                          src={p.src}
                          width={p.w}
                          height={p.h}
                          alt={p.name}
                          draggable={false}
                          onLoad={() => linesOn && measure()}
                          className="block h-auto w-full select-none drop-shadow-[0_10px_14px_rgba(60,40,20,0.12)]"
                        />
                        {l.main ? (
                          <div className="absolute left-[90%] top-[46%]" style={{ rotate: `${-(l.r ?? 0)}deg`, ...fit }}>
                            <HangTag k={l.p} />
                          </div>
                        ) : (
                          <p
                            className="absolute left-1/2 top-full mt-1 w-max -translate-x-1/2 rounded-pill bg-worn-surface/90 px-2.5 py-0.5 font-mono text-[12px] text-worn-ink-soft shadow-sm"
                            style={{ rotate: `${-(l.r ?? 0)}deg`, ...fit }}
                          >
                            {p.short} · {p.worn}×
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Poll and note (desktop) */}
                <AnimatePresence>
                  {look.poll ? (
                    <motion.div
                      key="poll"
                      className="absolute z-40 hidden lg:block"
                      style={{ left: px(800), top: py(76), width: px(295) }}
                      initial={reduced ? false : { opacity: 0, y: 14, rotate: 2 }}
                      animate={{ opacity: 1, y: 0, rotate: 1.5 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ delay: reduced ? 0 : 0.45, duration: 0.6, ease: EASE }}
                    >
                      <div style={fitCard}>
                        <PollCard />
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`note-${look.id}`}
                    className="absolute z-40 hidden lg:block"
                    style={{ left: px(760), top: py(look.noteY), width: px(310) }}
                    initial={reduced ? false : { opacity: 0, y: 12, rotate: -3 }}
                    animate={{ opacity: 1, y: 0, rotate: -1.5 }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}
                    transition={{ delay: reduced ? 0 : 0.5, duration: 0.6, ease: EASE }}
                  >
                    <div style={fitCard}>
                      <NoteCard look={look} />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Phones: the note under the mirror. Every note shares one cell, so the block never changes height. */}
              <div className="mt-4 grid lg:hidden">
                {LOOKS.map((l) => (
                  <div
                    key={l.id}
                    aria-hidden={l.id === lookId ? undefined : true}
                    className={`transition-[opacity,visibility] duration-300 [grid-area:1/1] ${
                      l.id === lookId ? 'visible opacity-100' : 'invisible opacity-0'
                    }`}
                  >
                    <NoteCard look={l} />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
          <div aria-hidden="true" style={{ height: stepSpace(LOOKS.length) }} />
        </div>

        {/* Phones: the friend poll that comes with the last look */}
        <div className="mx-auto mt-6 max-w-[560px] lg:hidden">
          <PollCard />
        </div>
      </div>
    </section>
  );
}
