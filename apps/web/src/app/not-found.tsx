import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Page not found', // Next adds its own noindex to a 404
};

export default function NotFound() {
  return (
    <PageShell>
      <section className="section flex min-h-[60svh] flex-col items-center justify-center py-16 text-center sm:py-24">
        <p className="ornament mx-auto w-fit font-mono text-micro uppercase tracking-[0.25em] text-worn-gold-deep">404</p>
        <h1 className="mx-auto mt-5 max-w-[16ch] text-balance font-display text-[clamp(36px,6vw,64px)] leading-[1.04] tracking-tight text-worn-ink">
          This page isn’t <em className="grad-text">in the closet.</em>
        </h1>
        <p className="mx-auto mt-5 max-w-[48ch] text-body-l text-worn-ink-soft">
          The link may be old or mistyped. Try one of these, or email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-worn-gold-deep underline underline-offset-2 hover:text-worn-ink">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary btn-lg">
            Worn Play <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/closet" className="btn-secondary btn-lg">
            Worn Closet <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
