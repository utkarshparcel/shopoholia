'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Check, CheckCheck, Gift, Hourglass, ShieldCheck, Undo2 } from 'lucide-react';
import { Glow, Screen, lift } from './shared';

type Claim = {
  icon: LucideIcon;
  title: string;
  amount?: string;
  countdown: string;
  urgent: boolean;
  action: 'spend' | 'chased' | 'filed';
};

const CLAIMS: Claim[] = [
  { icon: Gift, title: 'Gift card', amount: '₹2,000', countdown: 'Expires in 9 days', urgent: true, action: 'spend' },
  { icon: Undo2, title: 'Refund', amount: '₹1,499', countdown: '12 days late', urgent: true, action: 'chased' },
  { icon: ShieldCheck, title: 'Warranty · sneaker sole', countdown: '21 days left', urgent: false, action: 'filed' },
];

function Action({ kind }: { kind: Claim['action'] }) {
  if (kind === 'spend') {
    return (
      <span className="rounded-pill bg-worn-ink px-3 py-1 text-[12px] font-semibold text-worn-paper">Spend it</span>
    );
  }
  if (kind === 'chased') {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-worn-gold-deep">
        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Message ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-worn-success">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      Claim kit ready
    </span>
  );
}

export function VaultVisual() {
  return (
    <div
      role="img"
      aria-label="Sample Vault screen: ₹3,499 at risk. A ₹2,000 gift card expires in 9 days, with a Spend it action; a ₹1,499 refund is 12 days late, with a message to send the merchant; a sneaker-sole warranty has 21 days left and its claim kit is ready."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Vault">
        <div className="px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Money at risk</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
            <span className="font-display text-[36px] leading-none text-worn-ink sm:text-[40px]">₹3,499</span>
            <span className="text-[12px] text-worn-muted">plus a warranty claim</span>
          </p>
        </div>

        <ul className="divide-y divide-worn-rule/70 px-4 pb-1.5 sm:px-5">
          {CLAIMS.map(
            (c: Claim, i: number) => {
              const Icon = c.icon;
              return (
                <motion.li
                  key={`vault-claim-${i}`}
                  variants={lift}
                  custom={0.35 + i * 0.1}
                  className="flex items-center gap-3 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-worn-gold-tint">
                    <Icon className="h-4 w-4 text-worn-gold-deep" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption font-medium text-worn-ink">{c.title}</span>
                    <span
                      className={`mt-1 inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[12px] font-medium ${
                        c.urgent ? 'bg-worn-sale/10 text-[#a8391b]' : 'bg-worn-warm text-worn-ink-soft'
                      }`}
                    >
                      {i === 0 ? (
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-worn-sale opacity-60 motion-safe:animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-worn-sale" />
                        </span>
                      ) : (
                        <Hourglass className="h-3 w-3" aria-hidden="true" />
                      )}
                      {c.countdown}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    {c.amount ? (
                      <span className="font-display text-[19px] leading-none text-worn-ink">{c.amount}</span>
                    ) : null}
                    <Action kind={c.action} />
                  </span>
                </motion.li>
              );
            },
          )}
        </ul>
      </Screen>
    </div>
  );
}
