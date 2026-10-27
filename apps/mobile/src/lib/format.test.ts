import { describe, expect, it } from 'vitest';

import {
  CLOSET_LOCALE,
  formatClosetDate,
  formatClosetDateTime,
  formatMinor,
  formatRelativeTime,
} from './format';

describe('formatMinor (UX-MONEY-FMT / W003)', () => {
  it('uses Indian (en-IN) grouping for lakhs', () => {
    // 12_34_56_789 paise → ₹12,34,567.89
    const label = formatMinor(123_456_789, 'INR', CLOSET_LOCALE);
    expect(label).toMatch(/^₹/);
    expect(label).toContain('12,34,567.89');
  });

  it('picks locale from currency when omitted (USD / GBP)', () => {
    expect(formatMinor(1234, 'USD')).toMatch(/\$/);
    expect(formatMinor(1234, 'GBP')).toMatch(/£/);
  });
});

describe('formatClosetDate', () => {
  it('formats en-IN calendar dates', () => {
    const label = formatClosetDate('2026-08-29T10:00:00.000Z');
    expect(label).toMatch(/29/);
    expect(label).toMatch(/2026|Aug/);
    expect(CLOSET_LOCALE).toBe('en-IN');
  });

  it('returns em dash for invalid input', () => {
    expect(formatClosetDate('not-a-date')).toBe('—');
  });
});

describe('formatClosetDateTime', () => {
  it('includes time', () => {
    const label = formatClosetDateTime('2026-08-26T10:30:00.000Z', 'en-IN');
    expect(label).toMatch(/26/);
    expect(label.length).toBeGreaterThan(8);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('labels just now / relative windows', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
    expect(formatRelativeTime('2026-08-26T11:59:30.000Z', now)).toBe('Just now');
    expect(formatRelativeTime('2026-08-26T11:30:00.000Z', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-08-26T06:00:00.000Z', now)).toBe('6h ago');
    expect(formatRelativeTime('2026-08-24T12:00:00.000Z', now)).toBe('2d ago');
  });
});
