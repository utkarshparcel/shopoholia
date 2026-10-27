import { Platform } from 'react-native';

import { getCalendarPermissionStatus } from '@/src/lib/calendarPermission';

/**
 * Upcoming events from the device calendar for N03 (calendar → outfit), read with
 * `expo-calendar` once the user has allowed it. Only titles and times leave this module.
 * Without permission, or on the web, it throws {@link CalendarNotConnectedError}: there are no
 * sample events.
 */

export type DeviceCalendarEvent = {
  id?: string;
  title: string;
  startAt: string;
  endAt?: string;
};

export type DeviceCalendarAdapter = {
  listUpcoming(opts?: { daysAhead?: number; limit?: number }): Promise<DeviceCalendarEvent[]>;
};

/** The calendar can't be read: permission not given, or no device calendar (web). */
export class CalendarNotConnectedError extends Error {
  readonly code = 'calendar_not_connected';

  constructor(
    message = 'Your calendar isn’t connected. Allow calendar access in Settings to plan outfits for your events.',
  ) {
    super(message);
    this.name = 'CalendarNotConnectedError';
  }
}

export function isCalendarNotConnectedError(error: unknown): error is CalendarNotConnectedError {
  return error instanceof CalendarNotConnectedError;
}

const DAY_MS = 86_400_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

const expoCalendarEvents: DeviceCalendarAdapter = {
  async listUpcoming(opts) {
    if (Platform.OS === 'web') {
      throw new CalendarNotConnectedError(
        'The calendar can only be read in the WORN app on your phone.',
      );
    }
    if ((await getCalendarPermissionStatus()) !== 'granted') {
      throw new CalendarNotConnectedError();
    }
    const Calendar = await import('expo-calendar');
    // EVENT only: without an entity type iOS also asks for Reminders access.
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    if (calendars.length === 0) return [];

    const limit = clamp(opts?.limit ?? 5, 1, 20);
    const start = new Date();
    const end = new Date(start.getTime() + clamp(opts?.daysAhead ?? 14, 1, 60) * DAY_MS);
    const events = await Calendar.listEvents(
      calendars.map((calendar) => calendar.id),
      start,
      end,
    );
    return events
      .filter((event) => event.title?.trim())
      .map((event) => ({
        id: event.id,
        title: event.title.trim(),
        startAt: toIso(event.startDate),
        endAt: event.endDate ? toIso(event.endDate) : undefined,
      }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
      .slice(0, limit);
  },
};

let adapter: DeviceCalendarAdapter | null = null;

export function setDeviceCalendarAdapter(next: DeviceCalendarAdapter | null): void {
  adapter = next;
}

export function getDeviceCalendarAdapter(): DeviceCalendarAdapter {
  return adapter ?? expoCalendarEvents;
}

export function resetDeviceCalendarAdapter(): void {
  adapter = null;
}

export async function listUpcomingCalendarEvents(opts?: {
  daysAhead?: number;
  limit?: number;
}): Promise<DeviceCalendarEvent[]> {
  return getDeviceCalendarAdapter().listUpcoming(opts);
}
