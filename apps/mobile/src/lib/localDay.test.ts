import { afterEach, describe, expect, it } from 'vitest';
import { addMonthsToDayKey, endOfDayKeyIso, formatDayKey, localDayKey, parseDayKey } from './localDay';

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe('formatDayKey', () => {
  it('shows the same calendar day west of UTC', () => {
    process.env.TZ = 'America/Los_Angeles';
    // Read as an instant, the key is UTC midnight: the 28th in Los Angeles.
    expect(new Date('2026-10-29').getDate()).toBe(28);
    expect(formatDayKey('2026-10-29')).toBe('29 Oct 2026');
  });

  it('falls back to the timestamp formatter for other values', () => {
    expect(formatDayKey('not a date')).toBe('—');
  });
});

describe('localDayKey', () => {
  it('uses the device calendar day, not the UTC one', () => {
    // 00:30 local time on 5 March: whatever the zone, the local day is the 5th.
    const at = new Date(2026, 2, 5, 0, 30);
    expect(localDayKey(at)).toBe('2026-03-05');
  });

  it('adds days across month and year ends', () => {
    expect(localDayKey(new Date(2026, 0, 31, 23, 59), 1)).toBe('2026-02-01');
    expect(localDayKey(new Date(2026, 11, 31, 9), 2)).toBe('2027-01-02');
    expect(localDayKey(new Date(2026, 2, 1, 9), -1)).toBe('2026-02-28');
  });
});

describe('parseDayKey', () => {
  it('accepts real days and trims', () => {
    expect(parseDayKey(' 2026-10-01 ')).toBe('2026-10-01');
    expect(parseDayKey('2028-02-29')).toBe('2028-02-29');
  });

  it('rejects other formats and days that do not exist', () => {
    expect(parseDayKey('')).toBeNull();
    expect(parseDayKey('10/01/2026')).toBeNull();
    expect(parseDayKey('2026-1-01')).toBeNull();
    expect(parseDayKey('2026-02-30')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2027-02-29')).toBeNull();
  });
});

describe('addMonthsToDayKey', () => {
  it('adds calendar months, not 30-day blocks', () => {
    // 12 x 30 days from 15 Jan 2026 is 10 Jan 2027.
    expect(addMonthsToDayKey('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonthsToDayKey('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonthsToDayKey('2027-01-31', 13)).toBe('2028-02-29');
  });

  it('is null for anything that is not a real day', () => {
    expect(addMonthsToDayKey('2026-02-30', 1)).toBeNull();
  });
});

describe('endOfDayKeyIso', () => {
  it('ends the day on the device clock', () => {
    process.env.TZ = 'Asia/Kolkata';
    // 23:59:59 IST is 18:29:59 UTC the same day, not 05:29 the next morning.
    expect(endOfDayKeyIso('2026-11-03')).toBe('2026-11-03T18:29:59.000Z');
  });

  it('is null for anything that is not a real day', () => {
    expect(endOfDayKeyIso('2026-11-31')).toBeNull();
    expect(endOfDayKeyIso('soon')).toBeNull();
  });
});
