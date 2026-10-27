import { describe, expect, it } from 'vitest';

import {
  celebrationEyebrow,
  celebrationHapticForSource,
  celebrationVariantForSource,
} from './celebrationVariants';

describe('celebrationVariants (W007)', () => {
  it('uses distinct eyebrows per source', () => {
    expect(celebrationEyebrow('demo')).toMatch(/Sample/i);
    expect(celebrationEyebrow('manual')).toMatch(/Card saved/i);
    expect(celebrationEyebrow('oauth')).toMatch(/Inbox/i);
  });

  it('keeps demo haptic lighter than real credit', () => {
    expect(celebrationHapticForSource('demo')).toBe('light');
    expect(celebrationHapticForSource('manual')).toBe('medium');
    expect(celebrationHapticForSource('oauth')).toBe('medium');
  });

  it('demo copy never claims real money', () => {
    const v = celebrationVariantForSource(50_000, 'demo', 'INR');
    expect(v.body).toMatch(/Not real money/i);
    expect(v.body).toMatch(/Sample unlocked/i);
    expect(v.haptic).toBe('light');
  });

  it('manual and oauth copy diverge', () => {
    const manual = celebrationVariantForSource(25_00, 'manual', 'USD');
    const oauth = celebrationVariantForSource(25_00, 'oauth', 'USD');
    expect(manual.body).toMatch(/Nice/i);
    expect(oauth.body).toMatch(/Inbox connected/i);
    expect(manual.body).not.toBe(oauth.body);
  });
});
