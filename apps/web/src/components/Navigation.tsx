'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { SectionsMenu } from './SectionsMenu';
import { SiteSwitch } from './SiteSwitch';

/* How far the page has to move in one direction before the header reacts (stops jitter) */
const SCROLL_THRESHOLD = 8;
/* Within this of the top the header always shows */
const TOP_ZONE = 20;

const navLinks = [
  { href: '#loop', label: 'How it works' },
  { href: '#grwm', label: 'See it' },
  { href: '#how-it-works', label: 'Coins' },
  { href: '#faq', label: 'FAQ' },
];

/* The coin tick from the app icon, sized and coloured like the Closet header's tag */
function CoinGlyph() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 text-worn-gold-deep"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" strokeWidth="2.2" />
      <path d="M10 16 L14 20 L22 12" strokeWidth="2.8" />
    </svg>
  );
}

/**
 * Play's header: the same floating glass bar as the Closet page (ClosetHeader), with Play's links
 * and call to action. Unlike Closet's it still gets out of the way on the way down and comes back
 * on the way up: Play's pinned stages (the demo, the Coins track) fill the window, and a bar that
 * stayed would sit over their top edge. It also hides during in-page jumps (data-autohide), so a
 * pinned stage lands exactly where its pin starts (see SmoothScroll).
 */
export function Navigation() {
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Hide on the way down, come back on the way up.
  useEffect(() => {
    let lastY = window.scrollY;
    const handleScroll = () => {
      const y = window.scrollY;
      // An in-page jump (SmoothScroll marks <html> while it glides): stay out of the way, whichever
      // way it goes, so the target lands clear of the header. The next scroll up brings it back.
      if (document.documentElement.hasAttribute('data-anchor-jump')) {
        setHidden(y > TOP_ZONE);
        lastY = y;
        return;
      }
      if (y <= TOP_ZONE) {
        setHidden(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      setHidden(delta > 0);
      lastY = y;
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: 0, opacity: 1 }}
      // its own full height (the card plus the space above it), and faded so the card's shadow goes too
      animate={hidden ? { y: '-120%', opacity: 0 } : { y: 0, opacity: 1 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { y: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2, ease: 'easeOut' } }
      }
      // keyboard users tabbing into a hidden header get it back
      onFocusCapture={() => setHidden(false)}
      // hides itself during in-page jumps, so SmoothScroll doesn't leave room for it
      data-autohide=""
      className="fixed inset-x-0 top-0 z-40"
      role="banner"
    >
      <div className="mx-auto max-w-[1200px] px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="glass flex h-[60px] items-center justify-between gap-3 rounded-2xl px-4 sm:px-5">
          {/* Wordmark */}
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Worn - Home">
            <CoinGlyph />
            <span className="font-display text-[19px] leading-none tracking-[-0.01em] text-worn-ink">Worn</span>
          </Link>

          {/* Section anchors (lg up; SectionsMenu covers md to lg) */}
          <nav aria-label="Main navigation" className="hidden lg:flex items-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-caption font-medium tracking-wide text-worn-muted transition-colors duration-200 hover:text-worn-ink xl:px-3"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SectionsMenu items={navLinks} label="Main navigation" />
            <SiteSwitch current="play" />
            <Link href="#download" className="btn-primary btn-md !min-h-[44px] !px-4 !py-2 text-caption sm:!min-h-[40px]">
              <span className="sm:hidden">Join</span>
              <span className="hidden sm:inline">Get early access</span>
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
