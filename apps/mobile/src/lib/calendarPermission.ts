/**
 * Pluggable device-calendar permission for Closet “event → outfit” (N03).
 *
 * Production can inject an Expo Calendar adapter; tests / Expo Go without a
 * bridge use the in-memory stub (undetermined → granted/denied).
 */

export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type CalendarPermissionAdapter = {
  getStatus(): Promise<CalendarPermissionStatus>;
  requestPermission(): Promise<CalendarPermissionStatus>;
};

let adapter: CalendarPermissionAdapter | null = null;

const memoryStub = (() => {
  let status: CalendarPermissionStatus = 'undetermined';
  return {
    async getStatus() {
      return status;
    },
    async requestPermission() {
      if (status === 'undetermined') status = 'granted';
      return status;
    },
    _reset(next: CalendarPermissionStatus = 'undetermined') {
      status = next;
    },
  };
})();

export function setCalendarPermissionAdapter(
  next: CalendarPermissionAdapter | null,
): void {
  adapter = next;
}

export function getCalendarPermissionAdapter(): CalendarPermissionAdapter {
  return adapter ?? memoryStub;
}

/** Reset the default memory stub (tests only). */
export function resetCalendarPermissionStub(
  status: CalendarPermissionStatus = 'undetermined',
): void {
  memoryStub._reset(status);
  adapter = null;
}

export async function getCalendarPermissionStatus(): Promise<CalendarPermissionStatus> {
  return getCalendarPermissionAdapter().getStatus();
}

export async function requestCalendarPermission(): Promise<CalendarPermissionStatus> {
  return getCalendarPermissionAdapter().requestPermission();
}

export function isCalendarPermissionGranted(
  status: CalendarPermissionStatus,
): boolean {
  return status === 'granted';
}

export function calendarPermissionCopy() {
  return {
    title: 'Dress for what’s on your calendar',
    body: 'WORN can read event titles (interview, wedding, office) to plan outfits. Skip anytime.',
    cta: 'Allow calendar',
    skip: 'Not now',
  } as const;
}
