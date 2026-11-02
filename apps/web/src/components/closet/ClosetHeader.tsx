'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { SiteSwitch } from '@/components/SiteSwitch';

const NAV = [
  { label: 'Week', href: '#week' },
  { label: 'Stylist', href: '#stylist' },
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

/**
 * The section links for tablets (md to lg): the inline row needs ~1024px, and a second row would make
 * the header taller than the 60px the step tracks' sticky blocks are placed under. A small menu keeps
 * the bar one line. Escape closes it and returns focus to the button; moving focus or clicking
 * outside, or following a link, closes it too.
 */
function SectionsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (t: EventTarget | null) => t instanceof Node && !wrapRef.current?.contains(t);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onFocusIn = (e: FocusEvent) => outside(e.target) && setOpen(false);
    const onPointer = (e: PointerEvent) => outside(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative hidden md:block lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill px-3 text-caption font-medium tracking-wide text-worn-muted transition-colors duration-200 hover:text-worn-ink sm:min-h-[40px]"
      >
        Sections
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label="Closet sections"
          className="absolute right-0 top-full mt-3 grid w-[320px] grid-cols-2 gap-1 rounded-2xl border border-worn-rule bg-worn-surface p-2 shadow-pop"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center rounded-xl px-3 text-caption font-medium tracking-wide text-worn-muted transition-colors duration-200 hover:bg-worn-warm hover:text-worn-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
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
              <span className="max-[420px]:hidden">Worn </span>Closet
            </span>
          </Link>

          {/* Section anchors (lg up; SectionsMenu covers md to lg) */}
          <nav aria-label="Closet sections" className="hidden lg:flex items-center">
            {NAV.map(
              (item: { label: string; href: string }, i: number) => (
                <Link
                  key={`nav-${i}-${item.href}`}
                  href={item.href}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-caption font-medium tracking-wide text-worn-muted transition-colors duration-200 hover:text-worn-ink xl:px-3"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SectionsMenu />
            <SiteSwitch current="closet" />
            <Link href="#early-access" className="btn-primary btn-md !min-h-[44px] !px-4 !py-2 text-caption sm:!min-h-[40px]">
              <span className="sm:hidden">Join</span>
              <span className="hidden sm:inline">Request early access</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
