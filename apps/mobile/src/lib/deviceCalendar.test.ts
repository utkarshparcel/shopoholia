import { beforeEach, describe, expect, it } from 'vitest';

import {
  listUpcomingCalendarEvents,
  resetDeviceCalendarAdapter,
  setDeviceCalendarAdapter,
  stubUpcomingCalendarEvents,
} from './deviceCalendar';

describe('deviceCalendar', () => {
  beforeEach(() => {
    resetDeviceCalendarAdapter();
  });

  it('stubUpcomingCalendarEvents returns interview / office / wedding samples', () => {
    const events = stubUpcomingCalendarEvents({
      now: new Date('2026-08-26T08:00:00.000Z'),
      daysAhead: 14,
    });
    expect(events.map((e) => e.title)).toEqual([
      'Onsite interview',
      'Office standup',
      'Cousin shaadi reception',
    ]);
    expect(events.every((e) => typeof e.startAt === 'string')).toBe(true);
  });

  it('listUpcomingCalendarEvents uses the memory stub by default', async () => {
    const events = await listUpcomingCalendarEvents({ limit: 2 });
    expect(events.length).toBeLessThanOrEqual(2);
    expect(events[0]?.title).toMatch(/interview|standup|shaadi/i);
  });

  it('honors an injected adapter', async () => {
    setDeviceCalendarAdapter({
      listUpcoming: async () => [
        { id: 'x', title: 'Gym — legs', startAt: '2026-08-27T12:00:00.000Z' },
      ],
    });
    const events = await listUpcomingCalendarEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toMatch(/gym/i);
  });
});
