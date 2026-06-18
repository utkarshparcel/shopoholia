import { describe, expect, it } from 'vitest';
import { bg, roles, spacing, typography, wornGold } from '../theme/tokens';

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
