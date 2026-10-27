import { describe, expect, it } from 'vitest';
import { returnCountdown, returnConciergeCopy } from './returnCountdown';

describe('returnCountdown', () => {
  it('labels days left and urgency', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const c = returnCountdown('2026-01-12T12:00:00.000Z', now);
    expect(c.daysLeft).toBe(2);
    expect(c.label).toBe('2 days left');
    expect(c.hoursLeft).toBeNull();
    expect(c.urgent).toBe(true);
    expect(c.expired).toBe(false);
  });

  it('switches to hours when under 24h', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const c = returnCountdown('2026-01-10T17:00:00.000Z', now);
    expect(c.hoursLeft).toBe(5);
    expect(c.label).toBe('5 hours left');
    expect(c.urgent).toBe(true);
    expect(c.expired).toBe(false);
  });

  it('matches API windowDeadline ISO strings', () => {
    const windowDeadline = '2026-01-13T18:30:00.000Z';
    const now = new Date('2026-01-10T18:30:00.000Z');
    const c = returnCountdown(windowDeadline, now);
    expect(c.daysLeft).toBe(3);
    expect(c.label).toBe('3 days left');
    expect(c.hoursLeft).toBeNull();
    expect(c.urgent).toBe(true);
  });

  it('marks expired windows', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const c = returnCountdown('2026-01-09T12:00:00.000Z', now);
    expect(c.expired).toBe(true);
    expect(c.label).toBe('Expired');
    expect(c.hoursLeft).toBe(0);
  });

  it('builds concierge copy', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    expect(
      returnConciergeCopy({
        deadline: '2026-01-13T12:00:00.000Z',
        itemTitle: 'jacket',
        now,
      }),
    ).toBe('3 days left to return jacket — tap to start.');
  });
});
