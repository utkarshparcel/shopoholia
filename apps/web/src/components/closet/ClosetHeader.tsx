'use client';

import Link from 'next/link';

const NAV = [
  { label: 'Today', href: '#today' },
  { label: 'Wardrobe', href: '#wardrobe' },
  { label: 'Vault', href: '#vault' },
  { label: 'Accountant', href: '#accountant' },
  { label: 'Fit', href: '#fit' },
  { label: 'Market', href: '#market' },
];

function TagGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-worn-gold-deep"
      aria-hidden="true"
    >
      <path d="M12 4.2a2.3 2.3 0 1 1 2.3 2.3c-1.27 0-2.3.9-2.3 2.1v1.4" />
      <path d="M12 10 2.7 16.7a1.35 1.35 0 0 0 .8 2.45h17a1.35 1.35 0 0 0 .8-2.45L12 10Z" />
    </svg>
  );
}

export function ClosetHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto max-w-[1200px] px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="glass flex h-[60px] items-center justify-between gap-3 rounded-2xl px-4 sm:px-5">
          {/* Wordmark */}
          <Link
            href="/closet"
            className="flex shrink-0 items-center gap-2"
            aria-label="Worn Closet — home"
          >
            <TagGlyph />
            <span className="font-display text-[19px] leading-none tracking-[-0.01em] text-worn-ink">
              Worn Closet
            </span>
          </Link>

          {/* Section anchors */}
          <nav aria-label="Closet sections" className="hidden lg:flex items-center gap-6">
            {NAV.map(
              (item: { label: string; href: string }, i: number) => (
                <Link
                  key={`nav-${i}-${item.href}`}
                  href={item.href}
                  className="text-caption font-medium tracking-wide text-worn-muted transition-colors duration-200 hover:text-worn-ink"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <Link
              href="/"
              className="hidden text-caption font-medium text-worn-muted transition-colors duration-200 hover:text-worn-gold-deep sm:block"
            >
              ← Worn Play
            </Link>
            <Link href="/#download" className="btn-primary btn-md !min-h-[40px] !px-4 !py-2 text-caption">
              Get the app
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
