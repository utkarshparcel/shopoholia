'use client';

import Link from 'next/link';

function TagGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-worn-gold"
      aria-hidden="true"
    >
      <path d="M12 4.2a2.3 2.3 0 1 1 2.3 2.3c-1.27 0-2.3.9-2.3 2.1v1.4" />
      <path d="M12 10 2.7 16.7a1.35 1.35 0 0 0 .8 2.45h17a1.35 1.35 0 0 0 .8-2.45L12 10Z" />
    </svg>
  );
}

const PRODUCT_LINKS = [
  { label: 'Today', href: '#today' },
  { label: 'Wardrobe', href: '#wardrobe' },
  { label: 'Wear & Worth', href: '#worth' },
  { label: 'Vault', href: '#vault' },
  { label: 'Accountant', href: '#accountant' },
  { label: 'Market & Gifts', href: '#market' },
  { label: 'Fit', href: '#fit' },
  { label: 'Privacy & Household', href: '#privacy' },
];

const LEGAL_LINKS = [
  { label: 'Privacy', href: '/closet#privacy' },
  { label: 'Terms', href: 'mailto:legal@worn.app' },
  { label: 'Security', href: 'mailto:security@worn.app' },
];

export function ClosetFooter() {
  return (
    <footer className="bg-worn-ink text-worn-paper">
      <div className="section section-py py-14 sm:py-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          {/* Wordmark + description */}
          <div className="max-w-[36ch]">
            <Link href="/closet" className="flex items-center gap-2" aria-label="Worn Closet — home">
              <TagGlyph />
              <span className="font-display text-[22px] leading-none tracking-[-0.01em]">
                Worn Closet
              </span>
            </Link>
            <p className="mt-4 text-body text-worn-paper/60">
              The next chapter of Worn: every piece you bought, worn, accounted for, and easy to
              let go of.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block text-caption font-medium tracking-wide text-worn-gold transition-colors duration-200 hover:text-worn-paper"
            >
              See Worn Play →
            </Link>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:gap-14">
            <nav aria-label="Product">
              <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold">
                Product
              </p>
              <ul className="mt-4 space-y-2.5">
                {PRODUCT_LINKS.map(
                  (link: { label: string; href: string }, i: number) => (
                    <li key={`footer-product-${i}`}>
                      <Link
                        href={link.href}
                        className="text-caption text-worn-paper/70 transition-colors duration-200 hover:text-worn-paper"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="font-mono text-micro uppercase tracking-[0.22em] text-worn-gold">
                Legal
              </p>
              <ul className="mt-4 space-y-2.5">
                {LEGAL_LINKS.map(
                  (link: { label: string; href: string }, i: number) => (
                    <li key={`footer-legal-${i}`}>
                      <Link
                        href={link.href}
                        className="text-caption text-worn-paper/70 transition-colors duration-200 hover:text-worn-paper"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </nav>
          </div>
        </div>

        <div className="mt-14 border-t border-worn-paper/10 pt-6">
          <p className="text-micro tracking-wide text-worn-paper/50">
            © 2026 Worn, Inc. · Part of the Worn app
          </p>
        </div>
      </div>
    </footer>
  );
}
