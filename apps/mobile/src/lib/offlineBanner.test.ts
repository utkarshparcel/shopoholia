import { describe, expect, it } from 'vitest';

import { offlineBannerCopy } from './offlineBanner';

describe('offlineBannerCopy (W097)', () => {
  it('offers retry without queued line when empty', () => {
    const copy = offlineBannerCopy(0);
    expect(copy.message).toMatch(/offline/i);
    expect(copy.queuedLine).toBeNull();
    expect(copy.retryLabel).toBe('Retry');
    expect(copy.a11yLabel).toMatch(/Retry/);
  });

  it('shows queued count when present', () => {
    expect(offlineBannerCopy(1).queuedLine).toBe('1 action queued');
    expect(offlineBannerCopy(3).queuedLine).toBe('3 actions queued');
    expect(offlineBannerCopy(2).a11yLabel).toMatch(/2 actions queued/);
  });
});
