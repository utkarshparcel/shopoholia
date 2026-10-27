import type { ReactNode } from 'react';
import { ArrowUpRight, Check, Heart, Lock, Share2, Sparkles } from 'lucide-react';

/* Sample screens for the six ritual cards (Features). Same visual language as the hero phone:
   drawn once at 240 × 400, then RitualPhone scales the top of the phone down and fades it out.
   Static on purpose — the cards already move as they stack. Real Worn Play numbers only. */

const FADE = 'linear-gradient(180deg, #000 72%, transparent)';

/* Real catalog pieces (apps/api seed), the same ones the hero and the drop use */
const NEWME = {
  sage: 'https://assets.newme.asia/wp-content/uploads/2026/06/12073053427750de/NM-PRC-455-DRS-26-JUN-34374-SAGE(1).webp',
  red: 'https://assets.newme.asia/wp-content/uploads/2026/05/09102331e3473fe4/NM-IN-56-DRS-24-APR-5058-RED(0).webp',
  yellow: 'https://assets.newme.asia/wp-content/uploads/2026/04/021348591258e001/NM-PRC-414-DRS-26-APR-32495-YELLOW(1).webp',
  stripe: 'https://assets.newme.asia/wp-content/uploads/2026/03/1715592685b4dd97/NM-PRC-178-DRS-26-MAR-31596-OFFWHITE(1).webp',
};
const render = (look: string) => `/renders/${look}.webp`;

export function RitualPhone({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[231px] w-[150px] md:h-[308px] md:w-[200px]" aria-hidden="true">
      <div className="absolute inset-0 overflow-hidden" style={{ WebkitMaskImage: FADE, maskImage: FADE }}>
        <div className="absolute left-0 top-0 w-[260px] origin-top-left scale-[0.577] rounded-[34px] border border-worn-gold/25 bg-worn-ink p-2 md:scale-[0.769]">
          <div className="relative h-[400px] overflow-hidden rounded-[27px] border border-black/40 bg-worn-paper font-sans text-worn-ink">
            {children}
          </div>
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 text-center font-mono text-micro uppercase tracking-[0.22em] text-worn-muted">
        Sample
      </span>
    </div>
  );
}

function Coin() {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: 'radial-gradient(circle at 35% 32%, #ecd6ac, #c8a87a 55%, #9c7a4e)' }}
    />
  );
}

function Top({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3 font-mono text-[9px] tracking-widest text-worn-muted">
        <span>9:41</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-worn-gold" />
          <span className="inline-block h-2 w-6 rounded-full border border-worn-ink/30" />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between px-4">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-worn-muted">{eyebrow}</p>
          <p className="mt-1 font-display text-[20px] leading-none">{title}</p>
        </div>
        <span className="font-display text-[10px] tracking-[0.3em] text-worn-gold">WORN</span>
      </div>
    </>
  );
}

const Img = ({ src, className = '' }: { src: string; className?: string }) => (
  <img src={src} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
);

/* 01 — the feed */
export function FeedMock() {
  const items = [
    { img: NEWME.sage, title: 'Sage ruched mini', coins: '1,049' },
    { img: NEWME.red, title: 'Red one-shoulder', coins: '450' },
    { img: NEWME.yellow, title: 'Yellow floral maxi', coins: '1,049' },
    { img: NEWME.stripe, title: 'Striped knit maxi', coins: '949' },
  ];
  return (
    <>
      <Top eyebrow="Curated for you" title="Tonight’s edit" />
      <div className="mt-3 flex gap-1.5 px-4">
        {['All', 'Dresses', 'Tops', 'Co-ords'].map((c, i) => (
          <span
            key={c}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[8px] font-semibold ${
              i === 0 ? 'bg-worn-ink text-worn-paper' : 'border border-worn-rule bg-worn-surface text-worn-ink-soft'
            }`}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 px-3">
        {items.map((f) => (
          <div key={f.title} className="overflow-hidden rounded-xl border border-worn-rule bg-worn-surface shadow-card">
            <div className="relative aspect-[3/4] overflow-hidden bg-worn-warm">
              <Img src={f.img} />
              <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-worn-surface/90">
                <Heart size={8} strokeWidth={2.2} />
              </span>
            </div>
            <div className="p-1.5">
              <p className="font-mono text-[6px] uppercase tracking-[0.18em] text-worn-muted">NEWME</p>
              <p className="mt-0.5 truncate text-[9px] leading-tight">{f.title}</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] font-semibold">
                <Coin /> {f.coins} coins
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* 02 — try on me */
export function TryOnMock() {
  return (
    <>
      <Top eyebrow="Try on me" title="Sage ruched mini" />
      <div className="relative mx-3 mt-3 aspect-square overflow-hidden rounded-xl bg-worn-ink shadow-card">
        <Img src={render('sage-studio')} className="object-[50%_18%]" />
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-worn-ink/80 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.16em] text-worn-gold">
          <Sparkles size={8} /> On your avatar
        </span>
        <div className="absolute bottom-2 left-2 h-16 w-12 overflow-hidden rounded-lg border-2 border-worn-surface bg-worn-warm shadow-card">
          <Img src={NEWME.sage} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between px-4">
        <span className="flex items-center gap-1 text-[11px] font-semibold">
          <Coin /> 1,049 coins
        </span>
        <span className="rounded-full bg-worn-ink px-3 py-1.5 text-[9px] font-semibold text-worn-paper">Add to haul</span>
      </div>
      <p className="mt-2 px-4 font-mono text-[7px] uppercase tracking-[0.16em] text-worn-muted">New render · 50 coins</p>
    </>
  );
}

/* 03 — haul it */
export function HaulMock() {
  const items = [
    { img: NEWME.sage, title: 'Sage ruched mini', coins: '1,049' },
    { img: NEWME.red, title: 'Red one-shoulder', coins: '450' },
  ];
  return (
    <>
      <Top eyebrow="Your haul" title="Check out" />
      <div className="mt-3 space-y-2 px-3">
        {items.map((f) => (
          <div key={f.title} className="flex items-center gap-2.5 rounded-xl border border-worn-rule bg-worn-surface p-2 shadow-card">
            <div className="h-10 w-8 shrink-0 overflow-hidden rounded-md bg-worn-warm">
              <Img src={f.img} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[6px] uppercase tracking-[0.18em] text-worn-muted">NEWME</p>
              <p className="truncate text-[9px] leading-tight">{f.title}</p>
            </div>
            <span className="flex items-center gap-1 text-[9px] font-semibold">
              <Coin /> {f.coins}
            </span>
          </div>
        ))}
      </div>
      <div className="mx-3 mt-3 grid grid-cols-3 gap-1 rounded-full border border-worn-rule bg-worn-surface p-1">
        {['Express', 'Standard', 'Slow burn'].map((s, i) => (
          <span
            key={s}
            className={`rounded-full py-1 text-center text-[8px] font-semibold ${
              i === 0 ? 'bg-worn-ink text-worn-paper' : 'text-worn-ink-soft'
            }`}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="mx-4 mt-3 flex items-center justify-between border-t border-worn-rule pt-2.5">
        <span className="text-[9px] text-worn-ink-soft">Haul total</span>
        <span className="flex items-center gap-1 text-[11px] font-semibold">
          <Coin /> 1,499 coins
        </span>
      </div>
      <div className="mx-3 mt-3 rounded-full bg-worn-ink py-2 text-center text-[10px] font-semibold text-worn-paper">
        Pay with coins
      </div>
    </>
  );
}

/* 04 — the wait */
export function WaitMock() {
  const steps = ['Processing', 'Packed', 'Out for delivery', 'Arriving soon', 'Delivered'];
  const at = 2;
  return (
    <>
      <Top eyebrow="Express" title="On its way" />
      <div className="mx-3 mt-3 rounded-xl border border-worn-rule bg-worn-surface p-2.5 shadow-card">
        <p className="flex items-center justify-between font-mono text-[7px] uppercase tracking-wider text-worn-muted">
          <span className="font-display text-[8px] tracking-[0.3em] text-worn-gold">WORN</span>
          <span>now</span>
        </p>
        <p className="mt-1 font-display text-[14px] leading-tight">Out for delivery</p>
        <p className="mt-0.5 text-[8px] text-worn-ink-soft">Your haul is on its way.</p>
      </div>
      <ol className="mx-5 mt-4">
        {steps.map((s, i) => (
          <li key={s} className="relative flex items-center gap-2.5 pb-3.5 last:pb-0">
            {i < steps.length - 1 ? (
              <span className={`absolute left-[6.5px] top-3.5 h-full w-px ${i < at ? 'bg-worn-gold' : 'bg-worn-rule'}`} />
            ) : null}
            <span
              className={`relative grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${
                i < at
                  ? 'bg-worn-gold text-worn-ink'
                  : i === at
                    ? 'border-2 border-worn-gold bg-worn-surface'
                    : 'border border-worn-rule bg-worn-surface'
              }`}
            >
              {i < at ? <Check size={8} strokeWidth={3} /> : null}
            </span>
            <span
              className={`text-[10px] ${
                i === at ? 'font-semibold text-worn-ink' : i < at ? 'text-worn-ink-soft' : 'text-worn-muted'
              }`}
            >
              {s}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/* 05 — the reveal: two scenes free, the rest unlock for coins */
export function RevealMock() {
  const scenes = [
    { label: 'Studio', img: render('sage-studio') },
    { label: 'Golden hour', img: render('sage-beach') },
    { label: 'Street' },
    { label: 'Editorial dark' },
    { label: 'Night' },
    { label: 'Candid' },
  ];
  return (
    <>
      <Top eyebrow="Your haul is here" title="The reveal" />
      <div className="mt-3 grid grid-cols-3 gap-1.5 px-3">
        {scenes.map((s) => (
          <div key={s.label} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-worn-ink">
            {s.img ? (
              <Img src={s.img} className="object-top" />
            ) : (
              <>
                <span className="absolute inset-0 grid place-items-center text-worn-gold">
                  <Lock size={12} />
                </span>
                <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-worn-paper/90 px-1 py-0.5 text-[7px] font-semibold text-worn-ink">
                  <Coin /> 50
                </span>
              </>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-worn-ink/85 to-transparent px-1.5 pb-1 pt-3 text-[7px] font-semibold text-worn-paper">
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mx-3 mt-3 flex items-center justify-between rounded-xl border border-worn-gold/40 bg-worn-gold-tint px-3 py-2">
        <span className="text-[9px] font-semibold">2 scenes free</span>
        <span className="text-[9px] text-worn-gold-deep">Unlock · 50 coins</span>
      </div>
    </>
  );
}

/* 06 — the lookbook */
export function LookbookMock() {
  const looks = ['sage-cafe', 'red-rooftop', 'yellow-beach', 'pink-night'];
  return (
    <>
      <Top eyebrow="Every look you unlock" title="Lookbook" />
      <div className="mt-3 grid grid-cols-2 gap-1.5 px-3">
        {looks.map((l) => (
          <div key={l} className="aspect-square overflow-hidden rounded-lg bg-worn-ink">
            <Img src={render(l)} className="object-[50%_20%]" />
          </div>
        ))}
      </div>
      <div className="mx-3 mt-3 flex gap-1.5">
        <span className="flex flex-1 items-center justify-center gap-1 rounded-full bg-worn-ink py-2 text-[9px] font-semibold text-worn-paper">
          <Share2 size={9} /> Share
        </span>
        <span className="flex flex-1 items-center justify-center gap-1 rounded-full border border-worn-rule bg-worn-surface py-2 text-[9px] font-semibold">
          Buy for real <ArrowUpRight size={9} />
        </span>
      </div>
    </>
  );
}
