import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const calendar = vi.hoisted(() => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  getCalendars: vi.fn(),
  listEvents: vi.fn(),
}));
const permission = vi.hoisted(() => ({ status: 'granted' }));

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-calendar', () => calendar);
vi.mock('@/src/lib/calendarPermission', () => ({
  getCalendarPermissionStatus: async () => permission.status,
}));

import {
  CalendarNotConnectedError,
  isCalendarNotConnectedError,
  listUpcomingCalendarEvents,
  resetDeviceCalendarAdapter,
  setDeviceCalendarAdapter,
} from './deviceCalendar';

const NOW = new Date('2026-08-26T08:00:00.000Z');

describe('deviceCalendar (expo-calendar)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    platform.OS = 'ios';
    permission.status = 'granted';
    resetDeviceCalendarAdapter();
    calendar.getCalendars.mockReset().mockResolvedValue([{ id: 'cal-1' }, { id: 'cal-2' }]);
    calendar.listEvents.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads event calendars over the requested window and keeps titles and times only', async () => {
    calendar.listEvents.mockResolvedValue([
      {
        id: 'e2',
        title: ' Wedding reception ',
        startDate: '2026-08-30T13:00:00.000Z',
        endDate: '2026-08-30T18:00:00.000Z',
        location: 'Hall',
        notes: 'private',
      },
      { id: 'e1', title: 'Interview', startDate: new Date('2026-08-27T04:30:00.000Z'), endDate: null },
      { id: 'e3', title: '   ', startDate: '2026-08-28T04:30:00.000Z', endDate: null },
    ]);

    const events = await listUpcomingCalendarEvents({ daysAhead: 7, limit: 5 });

    expect(calendar.getCalendars).toHaveBeenCalledWith('event');
    const [ids, start, end] = calendar.listEvents.mock.calls[0]!;
    expect(ids).toEqual(['cal-1', 'cal-2']);
    expect((start as Date).toISOString()).toBe(NOW.toISOString());
    expect((end as Date).toISOString()).toBe('2026-09-02T08:00:00.000Z');
    expect(events).toEqual([
      { id: 'e1', title: 'Interview', startAt: '2026-08-27T04:30:00.000Z', endAt: undefined },
      {
        id: 'e2',
        title: 'Wedding reception',
        startAt: '2026-08-30T13:00:00.000Z',
        endAt: '2026-08-30T18:00:00.000Z',
      },
    ]);
  });

  it('applies the limit after sorting', async () => {
    calendar.listEvents.mockResolvedValue([
      { id: 'b', title: 'B', startDate: '2026-08-29T00:00:00.000Z' },
      { id: 'a', title: 'A', startDate: '2026-08-27T00:00:00.000Z' },
    ]);
    const events = await listUpcomingCalendarEvents({ limit: 1 });
    expect(events.map((e) => e.id)).toEqual(['a']);
  });

  it('returns no events when the device has no calendars', async () => {
    calendar.getCalendars.mockResolvedValue([]);
    expect(await listUpcomingCalendarEvents()).toEqual([]);
    expect(calendar.listEvents).not.toHaveBeenCalled();
  });

  it('throws "not connected" without permission, and never invents events', async () => {
    permission.status = 'denied';
    const error = await listUpcomingCalendarEvents().catch((e: unknown) => e);
    expect(isCalendarNotConnectedError(error)).toBe(true);
    expect(calendar.getCalendars).not.toHaveBeenCalled();
  });

  it('throws "not connected" on the web', async () => {
    platform.OS = 'web';
    await expect(listUpcomingCalendarEvents()).rejects.toBeInstanceOf(CalendarNotConnectedError);
    expect(calendar.getCalendars).not.toHaveBeenCalled();
  });

  it('honors an injected adapter', async () => {
    setDeviceCalendarAdapter({
      listUpcoming: async () => [{ title: 'Office', startAt: '2026-08-27T03:30:00.000Z' }],
    });
    expect(await listUpcomingCalendarEvents()).toEqual([
      { title: 'Office', startAt: '2026-08-27T03:30:00.000Z' },
    ]);
  });
});
