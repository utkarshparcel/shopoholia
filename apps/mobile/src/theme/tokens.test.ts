import { describe, expect, it } from 'vitest';

import {
  bg,
  closet,
  closetDark,
  CLOSET_TOKEN_KEYS,
  roles,
  spacing,
  typography,
  wornGold,
} from './tokens';

describe('design tokens', () => {
  it('mirrors the website brand palette', () => {
    expect(wornGold).toBe('#c8a87a');
    expect(bg).toBe('#faf8f5');
    expect(roles.accent).toBe('#806440');
    expect(roles.textMuted).toBe('#6e6861');
  });

  it('gives Closet the site palette, not a separate slate one', () => {
    expect(closet.bg).toBe(bg);
    expect(closet.ink).toBe('#0f0e0c');
    expect(closet.accent).toBe(roles.accent);
  });

  it('exports spacing and typography scales', () => {
    expect(spacing[4]).toBe(16);
    expect(typography.fsBody).toBe(14);
  });
});

describe('closet dark token parity', () => {
  it('exposes the same role keys on light and dark', () => {
    expect(CLOSET_TOKEN_KEYS.length).toBeGreaterThan(0);
    for (const key of CLOSET_TOKEN_KEYS) {
      expect(closet[key]).toMatch(/^#/);
      expect(closetDark[key]).toMatch(/^#/);
      expect(closetDark[key]).not.toBe(closet[key]);
    }
  });
});
