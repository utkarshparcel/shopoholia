'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#grwm', label: 'The Drop' },
    { href: '#loop', label: 'The Loop' },
    { href: '#how-it-works', label: 'Coins' },
    { href: '/closet', label: 'Closet', external: true },
  ];

  return (
    <motion.header
      initial={{ y: 0 }}
      animate={{ y: scrolled ? -100 : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ease-out ${
        scrolled ? 'bg-worn-paper/90 backdrop-blur-md border-b border-worn-rule' : 'bg-transparent'
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
            <Link
              href="#download"
              className="btn-primary btn-md"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Get the App
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md text-worn-ink hover:bg-worn-warm transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence mode="wait">
          {mobileOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reducedMotion ? 0 : 200, ease: 'easeOut' }}
              className="md:hidden overflow-hidden border-t border-worn-rule bg-worn-paper py-4"
            >
              <div className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-body-l font-medium text-worn-ink-soft hover:text-worn-ink"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="#download"
                  className="btn-primary btn-md text-center mt-2"
                  onClick={() => setMobileOpen(false)}
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