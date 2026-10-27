'use client';

/**
 * Shared slip-dress SVG used across the dress rack, mannequin and
 * ghost-wardrobe sections. The skirt carries the `hem` wind animation.
 */
export function Dress({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 190" className={className} aria-hidden="true">
      {/* hanger */}
      <path
        d="M34 22 Q60 4 86 22"
        fill="none"
        stroke="rgba(15,14,12,0.35)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M60 12 L60 20" stroke="rgba(15,14,12,0.35)" strokeWidth="2.5" strokeLinecap="round" />
      {/* straps */}
      <line x1="52" y1="20" x2="51" y2="46" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="68" y1="20" x2="69" y2="46" stroke={color} strokeWidth="3" strokeLinecap="round" />
      {/* bodice */}
      <path
        d="M51 44 C47 58 53 68 50 78 L70 78 C73 68 69 44 69 44 C63 40 57 40 51 44 Z"
        fill={color}
      />
      {/* skirt — the piece that waves in the wind */}
      <path
        className="hem"
        d="M50 78 C43 112 35 150 33 174 Q60 184 87 174 C85 150 77 112 70 78 Q60 74 50 78 Z"
        fill={color}
      />
    </svg>
  );
}
