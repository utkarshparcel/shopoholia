import type * as ExpoCalendar from 'expo-calendar';
import { Platform } from 'react-native';

/**
 * Device-calendar permission for Closet "event → outfit" (N03), backed by `expo-calendar`.
 *
 * `unavailable` means this device can't be asked at all (the web, or a build without the
 * calendar module): screens show "calendar not connected", never sample events.
 */
export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type CalendarPermissionAdapter = {
  getStatus(): Promise<CalendarPermissionStatus>;
  requestPermission(): Promise<CalendarPermissionStatus>;
};

type PermissionResponseLike = { status: string; granted: boolean };

export function toCalendarPermissionStatus(
  response: PermissionResponseLike,
): CalendarPermissionStatus {
  if (response.granted) return 'granted';
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

async function askExpoCalendar(
  ask: (calendar: typeof ExpoCalendar) => Promise<PermissionResponseLike>,
): Promise<CalendarPermissionStatus> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    return toCalendarPermissionStatus(await ask(await import('expo-calendar')));
  } catch (error) {
    if (__DEV__) console.warn('[calendar] permission unavailable', error);
    return 'unavailable';
  }
}

/** Full read access on iOS 17+ (not write-only); READ_CALENDAR on Android. */
const expoCalendarPermission: CalendarPermissionAdapter = {
  getStatus: () => askExpoCalendar((calendar) => calendar.getCalendarPermissions()),
  requestPermission: () => askExpoCalendar((calendar) => calendar.requestCalendarPermissions()),
};

let adapter: CalendarPermissionAdapter | null = null;

export function setCalendarPermissionAdapter(
  next: CalendarPermissionAdapter | null,
): void {
  adapter = next;
}

export function getCalendarPermissionAdapter(): CalendarPermissionAdapter {
  return adapter ?? expoCalendarPermission;
}

/** Back to the expo-calendar adapter (tests). */
export function resetCalendarPermissionAdapter(): void {
  adapter = null;
}

export async function getCalendarPermissionStatus(): Promise<CalendarPermissionStatus> {
  return getCalendarPermissionAdapter().getStatus();
}

/** Shows the system prompt when the user hasn't answered yet; otherwise reports the answer. */
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
