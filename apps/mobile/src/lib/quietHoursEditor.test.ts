import { describe, expect, it } from 'vitest';

import {
  formatHhMm,
  formatNextSendPreview,
  isValidQuietHoursHhMm,
  nextQuietHoursSendAt,
  nudgeQuietHours,
  parseHhMm,
} from './quietHoursEditor';

describe('quietHoursEditor (W082-QUIET-HOURS-EDITOR)', () => {
  it('parses and formats HH:mm', () => {
    expect(parseHhMm('22:00')).toEqual({ hours: 22, minutes: 0 });
    expect(parseHhMm('07:30')).toEqual({ hours: 7, minutes: 30 });
    expect(parseHhMm('25:00')).toBeNull();
    expect(formatHhMm(7, 0)).toBe('07:00');
    expect(isValidQuietHoursHhMm('22:00')).toBe(true);
    expect(isValidQuietHoursHhMm('9:00')).toBe(false);
  });

  it('nudges by 30 minutes across midnight', () => {
    expect(nudgeQuietHours('22:00', 30)).toBe('22:30');
    expect(nudgeQuietHours('23:30', 30)).toBe('00:00');
    expect(nudgeQuietHours('00:00', -30)).toBe('23:30');
  });

  it('previews next send inside quiet hours', () => {
    const now = new Date('2026-08-26T23:00:00.000Z');
    const at = nextQuietHoursSendAt(now, '22:00', '07:00');
    expect(at.toISOString()).toBe('2026-08-27T07:00:00.000Z');
    expect(formatNextSendPreview(now, '22:00', '07:00', 'UTC')).toMatch(
      /Next send at/,
    );
  });

  it('W025 shows next eligible send when outside quiet hours', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    expect(formatNextSendPreview(now, '22:00', '07:00', 'UTC')).toMatch(
      /Next send at|quiet hours open/i,
    );
    expect(nextQuietHoursSendAt(now, '22:00', '07:00').getTime()).toBe(now.getTime());
  });
});
