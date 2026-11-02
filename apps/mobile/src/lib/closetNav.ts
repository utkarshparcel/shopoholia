import type { BottomNavItem } from '@/src/components/ui';
import type { ClosetTabKey } from '@/src/lib/surfaceRoute';

/**
 * The Closet bottom bar. Typed to the keys the surface pill shows on (src/lib/surfaceRoute.ts).
 * Seven tabs share a 390pt-wide bar (~55pt each), and `adjustsFontSizeToFit` does nothing on web:
 * labels stay short enough to read whole ("Accountant" was cut to "Account…").
 */
export const CLOSET_NAV_ITEMS: (BottomNavItem & { key: ClosetTabKey })[] = [
  { key: 'today', label: 'Today', icon: '◷' },
  { key: 'wardrobe', label: 'Wardrobe', icon: '▤' },
  { key: 'vault', label: 'Vault', icon: '◰' },
  { key: 'accountant', label: 'Money', icon: '∑' },
  { key: 'recipients', label: 'Gifts', icon: '♡' },
  // U+FE0E asks for the text glyph: iOS otherwise draws ✂ as a red emoji among line icons.
  { key: 'fit', label: 'Fit', icon: '✂︎' },
  { key: 'disposition', label: 'Market', icon: '⇄' },
];
