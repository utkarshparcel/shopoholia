import { CLOSET_URL, PLAY_URL } from '@/lib/site';

const SITES = [
  { key: 'play', label: 'Play', href: `${PLAY_URL}/`, name: 'Worn Play' },
  { key: 'closet', label: 'Closet', href: `${CLOSET_URL}/`, name: 'Worn Closet' },
] as const;

/**
 * Which half of Worn you're looking at, and the way to the other one. Lives in both headers at every
 * width, so the two sites always read as two products under one name.
 */
export function SiteSwitch({ current, className = '' }: { current: 'play' | 'closet'; className?: string }) {
  return (
    <nav
      aria-label="Worn products"
      className={`inline-flex shrink-0 items-center rounded-pill border border-worn-rule bg-worn-surface/80 p-[3px] ${className}`}
    >
      {SITES.map((site) =>
        site.key === current ? (
          <span
            key={site.key}
            aria-current="page"
            className="inline-flex min-h-[34px] items-center rounded-pill bg-worn-ink px-3.5 text-caption font-semibold text-worn-paper"
          >
            {site.label}
          </span>
        ) : (
          <a
            key={site.key}
            href={site.href}
            aria-label={`Go to ${site.name}`}
            className="inline-flex min-h-[34px] items-center rounded-pill px-3.5 text-caption font-medium text-worn-muted transition-colors duration-200 hover:text-worn-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-worn-gold"
          >
            {site.label}
          </a>
        ),
      )}
    </nav>
  );
}
