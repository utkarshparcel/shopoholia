import Link from 'next/link';
import { Footer } from './Footer';
import { SiteSwitch } from './SiteSwitch';

/**
 * The frame for the site's plain pages (privacy, support, share links, 404): the Worn mark, the
 * Play | Closet switch and the Play footer. The header is in flow, not fixed, so it never sits over
 * a heading an in-page link jumps to.
 */
export function PageShell({
  children,
  current,
}: {
  children: React.ReactNode;
  current?: 'play' | 'closet';
}) {
  return (
    <>
      <header className="border-b border-worn-rule bg-worn-paper">
        <div className="section flex items-center justify-between gap-4 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-display-m tracking-tight text-worn-ink"
            aria-label="Worn - Home"
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="#c8a87a" strokeWidth="2" />
              <path d="M10 16 L14 20 L22 12" stroke="#c8a87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Worn
          </Link>
          <SiteSwitch current={current} />
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}

/** The dark sign-up band the share pages and the 404 end on, like the CTA sections on / and /closet. */
export function DarkBand({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="relative overflow-hidden bg-worn-ink text-worn-paper"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 80% at 15% 0%, rgba(200,168,122,0.22), transparent 62%), radial-gradient(50% 70% at 92% 100%, rgba(200,168,122,0.14), transparent 60%)',
        }}
      />
      <div className="section relative py-16 text-center sm:py-24">{children}</div>
    </section>
  );
}
