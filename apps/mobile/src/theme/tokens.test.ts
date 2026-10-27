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
  it('mirrors tokens.css brand palette', () => {
    expect(wornGold).toBe('#c8a87a');
    expect(bg).toBe('#faf8f5');
    expect(roles.accent).toBe('#9c7a4e');
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
