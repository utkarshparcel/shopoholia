import { describe, expect, it } from 'vitest';
import { warrantyBadge } from './warrantyBadge';

describe('warrantyBadge', () => {
  const day = 86_400_000;

  it('shows Claimed for a claimed warranty regardless of date', () => {
    const badge = warrantyBadge({
      coverageUntil: new Date(Date.now() - day).toISOString(),
      state: 'CLAIMED',
    });
    expect(badge).toEqual({ tone: 'claimed', label: 'Claimed' });
  });

  it('classifies an expired warranty', () => {
    const badge = warrantyBadge({
      coverageUntil: new Date(Date.now() - day).toISOString(),
      state: 'ACTIVE',
    });
    expect(badge.tone).toBe('expired');
  });

  it('classifies an expiring-soon warranty', () => {
    const badge = warrantyBadge({
      coverageUntil: new Date(Date.now() + 5 * day).toISOString(),
      state: 'ACTIVE',
    });
    expect(badge.tone).toBe('soon');
  });

  it('classifies a covered (far-out) warranty', () => {
    const badge = warrantyBadge({
      coverageUntil: new Date(Date.now() + 400 * day).toISOString(),
      state: 'ACTIVE',
    });
    expect(badge.tone).toBe('ok');
  });
});
