import { describe, expect, it } from 'vitest';

import {
  CLOSET_RESTORE_FALLBACK_TOAST,
  hydrateActiveSurface,
  shouldToastRestoreFallback,
} from './closetRestore';

describe('closetRestore (W005-CLOSET-RESTORE-SAFE)', () => {
  it('restores Closet from valid persist payload', () => {
    const result = hydrateActiveSurface(
      JSON.stringify({ state: { activeSurface: 'closet' }, version: 0 }),
    );
    expect(result).toEqual({ surface: 'closet', recovered: false });
    expect(shouldToastRestoreFallback(result)).toBe(false);
  });

  it('falls back to Play on corrupt JSON', () => {
    const result = hydrateActiveSurface('{not-json');
    expect(result.surface).toBe('play');
    expect(result.recovered).toBe(true);
    expect(result.reason).toBe('corrupt');
    expect(shouldToastRestoreFallback(result)).toBe(true);
  });

  it('falls back to Play on invalid surface value', () => {
    const result = hydrateActiveSurface(
      JSON.stringify({ state: { activeSurface: 'banana' }, version: 0 }),
    );
    expect(result.surface).toBe('play');
    expect(result.recovered).toBe(true);
    expect(result.reason).toBe('invalid_surface');
  });

  it('treats missing payload as Play without toast', () => {
    const result = hydrateActiveSurface(null);
    expect(result.surface).toBe('play');
    expect(result.recovered).toBe(false);
    expect(shouldToastRestoreFallback(result)).toBe(false);
  });

  it('exposes user-facing fallback toast copy', () => {
    expect(CLOSET_RESTORE_FALLBACK_TOAST).toMatch(/Play/i);
    expect(CLOSET_RESTORE_FALLBACK_TOAST).toMatch(/Closet/i);
  });
});
