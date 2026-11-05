'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

export type SectionLink = { label: string; href: string };

/**
 * A header's section links for tablets (md to lg): the inline row needs the lg width, and a second
 * row would make the header taller than the 60px the step tracks' sticky blocks are placed under. A
 * small menu keeps the bar one line. Escape closes it and returns focus to the button; moving focus
 * or clicking outside, or following a link, closes it too.
 */
export function SectionsMenu({ items, label }: { items: readonly SectionLink[]; label: string }) {
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
          aria-label={label}
          className="absolute right-0 top-full mt-3 grid w-[320px] grid-cols-2 gap-1 rounded-2xl border border-worn-rule bg-worn-surface p-2 shadow-pop"
        >
          {items.map((item) => (
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
