import { describe, expect, it } from 'vitest';

import { readyTimeLabel, revealWaitCopy } from './revealWait';

describe('revealWaitCopy', () => {
  // 20:00 in Asia/Kolkata.
  const evening = new Date('2026-11-04T14:30:00.000Z');

  it('promises the real time, in the user’s zone, for a reveal styled overnight', () => {
    // 07:00 IST the next morning.
    expect(
      revealWaitCopy('2026-11-05T01:30:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata', now: evening }),
    ).toBe("Delivered — your reveal is being styled tonight and will be ready by about 7 AM. We'll send you a push.");
  });

  it('uses the same instant in another zone and locale', () => {
    // The same 07:00 IST is 02:30 in Paris.
    const copy = revealWaitCopy('2026-11-05T01:30:00.000Z', {
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      now: evening,
    });
    expect(copy).toContain('2:30');
    expect(copy).not.toContain('AM');
  });

  it('says later today when it is the same day', () => {
    expect(
      revealWaitCopy('2026-11-04T15:30:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata', now: evening }),
    ).toBe("Delivered — your reveal is being styled and will be ready by about 9 PM. We'll send you a push.");
  });

  it('says shortly with no estimate', () => {
    expect(revealWaitCopy(null)).toBe(
      "Delivered — your reveal is being styled and will be ready shortly. We'll send you a push.",
    );
  });

  it('shows minutes only when the time is not on the hour', () => {
    expect(readyTimeLabel('2026-11-05T01:45:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata' })).toBe('7:15 AM');
  });
});
