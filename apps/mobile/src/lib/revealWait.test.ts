import { describe, expect, it } from 'vitest';

import { readyTimeLabel, revealWaitCopy, tryonWaitCopy } from './revealWait';

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

  it('says the weekday when it is further off', () => {
    expect(
      revealWaitCopy('2026-11-07T01:30:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata', now: evening }),
    ).toBe("Delivered — your reveal is being styled and will be ready by about 7 AM Saturday. We'll send you a push.");
  });

  it('shows minutes only when the time is not on the hour', () => {
    expect(readyTimeLabel('2026-11-05T01:45:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata' })).toBe('7:15 AM');
  });
});

describe('tryonWaitCopy', () => {
  // 20:00 in Asia/Kolkata.
  const evening = new Date('2026-11-04T14:30:00.000Z');

  it('uses the reveal’s wording for a try-on styled overnight', () => {
    expect(
      tryonWaitCopy('2026-11-05T01:30:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata', now: evening }),
    ).toBe('Your try-on is being styled tonight and will be ready by about 7 AM. Tap Try on me again to see it.');
  });

  it('says later today when it is the same day', () => {
    expect(
      tryonWaitCopy('2026-11-04T15:45:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata', now: evening }),
    ).toBe('Your try-on is being styled and will be ready by about 9:15 PM. Tap Try on me again to see it.');
  });

  it('says shortly with no estimate (the agent is down), and with a bad one', () => {
    const shortly = 'Your try-on is being styled and will be ready shortly. Tap Try on me again to see it.';
    expect(tryonWaitCopy(null)).toBe(shortly);
    expect(tryonWaitCopy(undefined)).toBe(shortly);
    expect(tryonWaitCopy('not a date')).toBe(shortly);
  });
});
