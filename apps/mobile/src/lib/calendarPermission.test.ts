import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const calendar = vi.hoisted(() => ({
  getCalendarPermissions: vi.fn(),
  requestCalendarPermissions: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-calendar', () => calendar);

import {
  calendarPermissionCopy,
  getCalendarPermissionStatus,
  isCalendarPermissionGranted,
  requestCalendarPermission,
  resetCalendarPermissionAdapter,
  setCalendarPermissionAdapter,
  toCalendarPermissionStatus,
} from './calendarPermission';

const response = (status: string, granted = status === 'granted') => ({
  status,
  granted,
  canAskAgain: true,
  expires: 'never',
});

describe('calendarPermission (expo-calendar)', () => {
  beforeEach(() => {
    platform.OS = 'ios';
    resetCalendarPermissionAdapter();
    calendar.getCalendarPermissions.mockReset();
    calendar.requestCalendarPermissions.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the real permission without prompting', async () => {
    calendar.getCalendarPermissions.mockResolvedValue(response('undetermined'));

    expect(await getCalendarPermissionStatus()).toBe('undetermined');
    expect(calendar.requestCalendarPermissions).not.toHaveBeenCalled();
  });

  it('asks for full access (not write-only) and reports the answer', async () => {
    calendar.requestCalendarPermissions.mockResolvedValue(response('granted'));
    expect(await requestCalendarPermission()).toBe('granted');
    expect(calendar.requestCalendarPermissions).toHaveBeenCalledWith();

    calendar.requestCalendarPermissions.mockResolvedValue(response('denied'));
    expect(await requestCalendarPermission()).toBe('denied');
  });

  it('is unavailable on the web, without loading the module', async () => {
    platform.OS = 'web';
    expect(await requestCalendarPermission()).toBe('unavailable');
    expect(await getCalendarPermissionStatus()).toBe('unavailable');
    expect(calendar.requestCalendarPermissions).not.toHaveBeenCalled();
  });

  it('is unavailable when the native module fails, never granted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    calendar.requestCalendarPermissions.mockRejectedValue(new Error('no native module'));
    expect(await requestCalendarPermission()).toBe('unavailable');
  });

  it('maps permission responses', () => {
    expect(toCalendarPermissionStatus(response('granted'))).toBe('granted');
    expect(toCalendarPermissionStatus(response('denied'))).toBe('denied');
    expect(toCalendarPermissionStatus(response('undetermined'))).toBe('undetermined');
    expect(isCalendarPermissionGranted('granted')).toBe(true);
    expect(isCalendarPermissionGranted('unavailable')).toBe(false);
  });

  it('honors an injected adapter', async () => {
    setCalendarPermissionAdapter({
      getStatus: async () => 'denied',
      requestPermission: async () => 'denied',
    });
    expect(await requestCalendarPermission()).toBe('denied');
    expect(calendar.requestCalendarPermissions).not.toHaveBeenCalled();
  });

  it('copy names what is read and that it can be skipped', () => {
    const copy = calendarPermissionCopy();
    expect(copy.body).toMatch(/event titles/);
    expect(copy.skip).toBe('Not now');
  });
});
