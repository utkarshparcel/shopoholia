import { describe, expect, it } from 'vitest';
import { morningGreeting, outfitWhyThis } from './outfitWhy';

describe('outfitWhyThis', () => {
  it('builds a why line from weather, occasion, and categories', () => {
    const line = outfitWhyThis({
      occasion: 'WORK',
      weatherCtx: { tempC: 28, condition: 'humid' },
      itemCategories: ['shirt', 'jeans'],
    });
    expect(line).toMatch(/^Why this:/);
    expect(line).toContain('28°C');
    expect(line).toContain('humid');
    expect(line).toContain('work-appropriate');
    expect(line).toContain('shirt');
  });

  it('handles temp-only, condition-only, and formal occasion', () => {
    expect(outfitWhyThis({ weatherCtx: { temp: 22 } })).toContain('22°C today');
    expect(outfitWhyThis({ weatherCtx: { condition: 'rainy' } })).toContain(
      'rainy weather',
    );
    expect(outfitWhyThis({ occasion: 'party' })).toContain('leaned party');
  });
});

describe('morningGreeting', () => {
  it('splits morning / afternoon / evening', () => {
    expect(morningGreeting(new Date('2026-08-26T08:00:00'))).toBe('Good morning');
    expect(morningGreeting(new Date('2026-08-26T14:00:00'))).toBe('Good afternoon');
    expect(morningGreeting(new Date('2026-08-26T20:00:00'))).toBe('Good evening');
  });
});
