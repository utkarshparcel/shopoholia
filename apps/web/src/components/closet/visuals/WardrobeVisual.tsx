'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Mail } from 'lucide-react';
import { Glow, Screen, Thumb, lift, pop } from './shared';

type Email = { subject: string; item: string; price: string };

const EMAILS: Email[] = [
  { subject: 'Order confirmed', item: 'Ruched mini · Sage · M', price: '₹2,600' },
  { subject: 'Your order has shipped', item: 'Bow knit midi · Stripe · M', price: '₹3,200' },
];

/* The messy camera roll: same pieces, every kind of photo */
const ROLL = [
  { img: '/renders/sage-cafe.webp', tilt: -9, x: 0, y: 6 },
  { img: '/renders/black-night.webp', tilt: 6, x: 22, y: 0 },
  { img: '/renders/yellow-beach.webp', tilt: -4, x: 44, y: 8 },
  { img: '/renders/stripe-mirror.webp', tilt: 8, x: 66, y: 2 },
];

type Piece = { img: string; colour: string; tag: string };

const PIECES: Piece[] = [
  { img: '/renders/sage-studio.webp', colour: 'Sage', tag: 'Summer' },
  { img: '/renders/black-studio.webp', colour: 'Black', tag: 'Evening' },
  { img: '/renders/yellow-studio.webp', colour: 'Yellow', tag: 'Festive' },
  { img: '/renders/stripe-studio.webp', colour: 'Stripe', tag: 'Casual' },
];

export function WardrobeVisual() {
  return (
    <div
      role="img"
      aria-label="Sample import screen: two order emails become wardrobe pieces with their prices, and a messy camera roll is sorted into four dresses, each tagged with its colour and a season or occasion."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Getting your closet in">
        <div className="p-4 sm:p-5">
          {/* From order emails */}
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">From order emails</p>
          <ul className="mt-2 divide-y divide-worn-rule/70">
            {EMAILS.map(
              (e: Email, i: number) => (
                <motion.li
                  key={`wardrobe-email-${i}`}
                  variants={lift}
                  custom={0.3 + i * 0.1}
                  className={`flex items-center gap-3 py-2 sm:py-2.5 ${i > 0 ? 'hidden sm:flex' : ''}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-worn-gold-tint">
                    <Mail className="h-4 w-4 text-worn-gold-deep" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption font-medium text-worn-ink">{e.subject}</span>
                    <span className="block truncate text-[12px] text-worn-muted">{e.item}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-caption font-medium text-worn-ink">{e.price}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-micro uppercase tracking-[0.14em] text-worn-success">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Added
                    </span>
                  </span>
                </motion.li>
              ),
            )}
          </ul>

          {/* From the camera roll */}
          <div className="mt-2 border-t border-worn-rule/70 pt-3 sm:mt-3 sm:pt-3.5">
            <div className="flex items-center gap-3">
              <div className="relative h-[52px] w-[100px] shrink-0">
                {ROLL.map(
                  (r: { img: string; tilt: number; x: number; y: number }, i: number) => (
                    <motion.span
                      key={`wardrobe-roll-${i}`}
                      variants={pop}
                      custom={0.45 + i * 0.06}
                      className="absolute block rounded-md border-2 border-white shadow-card"
                      style={{ left: r.x, top: r.y, rotate: r.tilt }}
                    >
                      <Thumb src={r.img} focus="50% 40%" className="h-[42px] w-[32px] rounded-[4px]" />
                    </motion.span>
                  ),
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-worn-gold-deep" aria-hidden="true" />
              <p className="min-w-0 text-[12px] leading-snug text-worn-muted">
                <span className="block font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">
                  From your camera roll
                </span>
                Sorted, tagged and filed
              </p>
            </div>

            <ul className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              {PIECES.map(
                (p: Piece, i: number) => (
                  <motion.li
                    key={`wardrobe-piece-${i}`}
                    variants={lift}
                    custom={0.7 + i * 0.08}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-worn-rule bg-worn-paper p-1.5 pr-2"
                  >
                    <Thumb src={p.img} focus="50% 36%" zoom={1.7} className="h-10 w-10 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block font-mono text-micro uppercase tracking-[0.14em] text-worn-gold-deep">
                        Dress
                      </span>
                      <span className="block truncate text-[12px] text-worn-ink-soft">
                        {p.colour} · {p.tag}
                      </span>
                    </span>
                  </motion.li>
                ),
              )}
            </ul>
          </div>
        </div>
      </Screen>
    </div>
  );
}
