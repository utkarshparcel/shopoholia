'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SiteSwitch } from './SiteSwitch';

/* How far the page has to move in one direction before the header reacts (stops jitter) */
const SCROLL_THRESHOLD = 8;
/* Within this of the top the header always shows, transparent */
const TOP_ZONE = 20;

const navLinks = [
  { href: '#grwm', label: 'The Drop' },
  { href: '#loop', label: 'The Loop' },
  { href: '#how-it-works', label: 'Coins' },
];

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Whether closing the menu should hand focus back to its button (not after following a link)
  const returnFocus = useRef(false);

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
      setScrolled(y > TOP_ZONE);
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

  const closeMenu = useCallback((focusButton: boolean) => {
    returnFocus.current = focusButton;
    setMobileOpen(false);
  }, []);

  // Open: focus the first link. Closed by Escape or the button: focus goes back to the button.
  useEffect(() => {
    if (mobileOpen) {
      menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu(true);
        }
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [mobileOpen, closeMenu]);

  const visible = !hidden || mobileOpen;

  return (
    <motion.header
      initial={{ y: 0 }}
      animate={{ y: visible ? 0 : -100 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
      // keyboard users tabbing into a hidden header get it back
      onFocusCapture={() => setHidden(false)}
      // hides itself during in-page jumps, so SmoothScroll doesn't leave room for it
      data-autohide=""
      className={`fixed top-0 left-0 right-0 z-40 transition-colors duration-300 ease-out ${
        scrolled || mobileOpen ? 'bg-worn-paper/90 backdrop-blur-md border-b border-worn-rule' : 'bg-transparent'
      }`}
      role="banner"
    >
      <nav className="section section-py py-4" aria-label="Main navigation">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-worn-ink font-display text-display-m tracking-tight"
            aria-label="Worn - Home"
          >
            <span className="relative">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="16" cy="16" r="14" stroke="#c8a87a" strokeWidth="2"/>
                <path d="M10 16 L14 20 L22 12" stroke="#c8a87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            Worn
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-body font-medium text-worn-ink-soft hover:text-worn-ink transition-colors duration-fast"
              >
                {link.label}
              </Link>
            ))}
            <SiteSwitch current="play" />
            <Link
              href="#download"
              className="btn-primary btn-md"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Get the App
            </Link>
          </div>

          {/* Mobile: the product switch stays visible beside the menu */}
          <div className="flex items-center gap-2 md:hidden">
            <SiteSwitch current="play" />
            <button
              ref={menuButtonRef}
              className="p-2 rounded-md text-worn-ink hover:bg-worn-warm transition-colors"
              onClick={() => (mobileOpen ? closeMenu(true) : setMobileOpen(true))}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence mode="wait">
          {mobileOpen && (
            <motion.div
              ref={menuRef}
              id="mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              // framer-motion durations are in seconds
              transition={{ duration: reducedMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="md:hidden overflow-hidden border-t border-worn-rule bg-worn-paper py-4"
            >
              <div className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-body-l font-medium text-worn-ink-soft hover:text-worn-ink"
                    onClick={() => closeMenu(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="#download"
                  className="btn-primary btn-md text-center mt-2"
                  onClick={() => closeMenu(false)}
                >
                  <Download className="w-4 h-4 inline-block mr-2" aria-hidden="true" />
                  Get the App
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
