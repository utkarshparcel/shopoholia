'use client';

import { motion } from 'framer-motion';
import { Download, Mail, MessageSquare, Trash2 } from 'lucide-react';
import { Glow, Screen, lift } from './shared';

export function PrivacyVisual() {
  return (
    <div
      role="img"
      aria-label="Sample consent ledger: Gmail order emails connected on 12 March with explicit consent, with a Revoke control; pasted messages, only what you share; buttons to export or delete everything."
      className="relative isolate"
    >
      <Glow className="-inset-x-3 sm:-inset-x-6 -inset-y-10" />

      <Screen title="Consent ledger">
        <div className="p-4 sm:p-5">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-worn-muted">Sources</p>
          <ul className="mt-1 divide-y divide-worn-rule/70">
            <motion.li variants={lift} custom={0.3} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-worn-gold-tint">
                <Mail className="h-4 w-4 text-worn-gold-deep" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-caption font-medium text-worn-ink">Gmail · order emails</span>
                <span className="mt-0.5 flex items-start gap-1.5 text-[12px] text-worn-muted">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-worn-success" aria-hidden="true" />
                  <span className="text-balance">{'Connected 12 Mar · explicit consent'}</span>
                </span>
              </span>
              <span className="shrink-0 rounded-pill border border-worn-rule px-3 py-1 text-[12px] font-semibold text-worn-ink-soft">
                Revoke
              </span>
            </motion.li>
            <motion.li variants={lift} custom={0.4} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-worn-warm">
                <MessageSquare className="h-4 w-4 text-worn-muted" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-caption font-medium text-worn-ink">Pasted messages</span>
                <span className="mt-0.5 block text-[12px] text-worn-muted">Only what you share</span>
              </span>
            </motion.li>
          </ul>

          {/* The ledger itself: every grant, dated (from sm; the source row carries it on phones) */}
          <motion.div
            variants={lift}
            custom={0.5}
            className="mt-2 hidden rounded-xl border border-dashed border-worn-rule bg-worn-paper px-3.5 py-3 sm:block"
          >
            <p className="font-mono text-micro uppercase tracking-[0.16em] text-worn-gold-deep">12 Mar · 10:42</p>
            <p className="mt-1 text-[12px] text-worn-ink-soft">
              Consent given · Gmail, order emails only
            </p>
          </motion.div>

          <motion.div variants={lift} custom={0.6} className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-worn-rule px-3 py-1.5 text-[12px] font-semibold text-worn-ink-soft">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-worn-sale/30 px-3 py-1.5 text-[12px] font-semibold text-[#a8391b]">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete everything
            </span>
          </motion.div>
        </div>
      </Screen>
    </div>
  );
}
