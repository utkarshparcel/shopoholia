'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, ChevronRight, Clock, HandHeart, Store } from 'lucide-react';
import { Glow, Screen, Thumb, lift } from './shared';

type Route = { icon: LucideIcon; title: string; sub: string };

const ROUTES: Route[] = [
  { icon: Store, title: 'Sell', sub: 'Priced from brand and wear' },
  { icon: ArrowLeftRight, title: 'Swap', sub: 'Offer it to your swap circle' },
  { icon: HandHeart, title: 'Donate', sub: 'Book a pickup from home' },
];

export function MarketVisual() {
  return (
    <div
      role="img"
      aria-label="Sample Market card: a pink sequin gown not worn in a year, with three ways out. Sell, at an estimated ₹1,100 to ₹1,400; swap with your circle; or donate with a pickup."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Market">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <Thumb
              src="/renders/pink-studio.webp"
              focus="50% 38%"
              zoom={1.2}
              className="h-[84px] w-[62px] rounded-xl sm:h-[108px] sm:w-[80px]"
            />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-worn-gold-tint px-2.5 py-1 font-mono text-micro uppercase tracking-[0.14em] text-worn-gold-deep">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Not worn in a year
              </span>
              <p className="mt-2 font-display text-[22px] leading-[1.1] text-worn-ink sm:text-[24px]">Pink sequin gown</p>
              <p className="mt-1 text-[12px] text-worn-muted">Worn once · last out Oct 2025</p>
            </div>
          </div>

          <ul className="mt-3.5 space-y-1.5 sm:mt-4 sm:space-y-2">
            {ROUTES.map(
              (r: Route, i: number) => {
                const Icon = r.icon;
                const sell = i === 0;
                return (
                  <motion.li
                    key={`market-route-${i}`}
                    variants={lift}
                    custom={0.35 + i * 0.1}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 sm:py-2.5 ${
                      sell ? 'border-worn-gold bg-worn-gold-tint' : 'border-worn-rule bg-worn-surface'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        sell ? 'bg-worn-surface' : 'bg-worn-warm'
                      }`}
                    >
                      <Icon className="h-4 w-4 text-worn-gold-deep" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-caption font-medium text-worn-ink">{r.title}</span>
                      <span className="block truncate text-[12px] text-worn-muted">{r.sub}</span>
                    </span>
                    {sell ? (
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-[19px] leading-none text-worn-ink">₹1,100–1,400</span>
                        <span className="mt-1 block font-mono text-micro uppercase tracking-[0.16em] text-worn-gold-deep">
                          Estimate
                        </span>
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-worn-muted" aria-hidden="true" />
                    )}
                  </motion.li>
                );
              },
            )}
          </ul>
        </div>
      </Screen>
    </div>
  );
}
