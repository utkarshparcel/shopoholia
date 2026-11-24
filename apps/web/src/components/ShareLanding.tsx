'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { WaitlistForm } from './WaitlistForm';
import { DarkBand } from './PageShell';
import { StoreButtons } from './StoreButtons';
import { APP_EVERYWHERE, APP_LIVE } from '@/lib/site';
import { SHARE_KINDS, shareCodeFromPath, type ShareKind } from '@/lib/share-links';

/**
 * What a friend sees when they open a link someone shared from the app (/r, /c, /h, /p/…). The pages
 * are static: the code is read from the address in the browser, and nothing is looked up, so they
 * work before the backend does.
 */
export function ShareLanding({ kind }: { kind: ShareKind }) {
  const base = SHARE_KINDS[kind];
  // a Play link once the app is in a store: download steps and buttons instead of the list
  const live = APP_LIVE && base.list === 'play' && base.live ? base.live : null;
  const copy = live ? { ...base, ...live } : base;
  // undefined until mounted (the server doesn't know the address), then the code or null
  const [code, setCode] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setCode(shareCodeFromPath(kind, window.location.pathname));
  }, [kind]);

  return (
    <>
      <section className="section py-12 sm:py-20">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="ornament mx-auto w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">
            {copy.eyebrow}
          </p>
          <h1 className="mx-auto mt-5 max-w-[18ch] text-balance font-display text-[clamp(36px,6vw,64px)] leading-[1.04] tracking-tight text-worn-ink">
            {copy.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-[56ch] text-body-l text-worn-ink-soft">{copy.body}</p>

          {copy.showsCode ? <CodeCard label={copy.codeLabel} code={code} /> : null}

          <ol className="mx-auto mt-10 grid max-w-[600px] gap-3 text-left">
            {copy.steps.map((step, i) => (
              <li key={i} className="flex gap-4 rounded-card border border-worn-rule bg-worn-surface p-4 shadow-sm">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-worn-gold-tint font-mono text-caption text-worn-gold-deep"
                >
                  {i + 1}
                </span>
                <span className="text-body-l text-worn-ink-soft">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <DarkBand id="join">
        <h2 className="mx-auto max-w-[18ch] text-balance font-display text-[clamp(32px,5vw,56px)] leading-[1.05] tracking-tight">
          {copy.ctaTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-body-l text-worn-paper/70">{copy.ctaBody}</p>
        <div className="mt-8 flex flex-col items-center gap-4">
          {live ? <StoreButtons /> : null}
          {live && APP_EVERYWHERE ? null : <WaitlistForm list={copy.list} />}
          <Link
            href={copy.list === 'closet' ? '/closet' : '/'}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill border border-worn-paper/25 bg-worn-paper/10 px-7 text-[15px] font-semibold transition-colors hover:border-worn-gold hover:text-worn-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            {copy.list === 'closet' ? 'See Worn Closet' : 'See how Worn Play works'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </DarkBand>
    </>
  );
}

function CodeCard({ label, code }: { label: string; code: string | null | undefined }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-[420px] rounded-lg border border-worn-gold/40 bg-worn-gold-tint p-5">
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-worn-gold-deep">{label}</p>
      {code === null ? (
        <p className="mt-3 text-body text-worn-ink-soft">
          This link is missing its code. Ask whoever sent it to share it again from the app.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <p
            className="min-w-[8ch] break-all font-mono text-[28px] font-medium tracking-[0.18em] text-worn-ink"
            aria-live="polite"
          >
            {code ?? <span className="text-worn-muted/60">······</span>}
          </p>
          <button
            type="button"
            onClick={copyCode}
            disabled={!code}
            className="btn-secondary btn-sm"
          >
            {copied === 'yes' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied === 'yes' ? 'Copied' : 'Copy code'}
          </button>
        </div>
      )}
      <p role="status" className="sr-only">
        {copied === 'yes' ? 'Code copied' : ''}
      </p>
      {copied === 'failed' ? (
        <p className="mt-2 text-caption text-worn-muted">Couldn’t copy it here. Write the code down instead.</p>
      ) : null}
    </div>
  );
}
