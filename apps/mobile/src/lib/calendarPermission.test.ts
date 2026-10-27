import { beforeEach, describe, expect, it } from 'vitest';

import {
  calendarPermissionCopy,
  getCalendarPermissionStatus,
  isCalendarPermissionGranted,
  requestCalendarPermission,
  resetCalendarPermissionStub,
  setCalendarPermissionAdapter,
} from './calendarPermission';

describe('calendarPermission', () => {
  beforeEach(() => {
    resetCalendarPermissionStub('undetermined');
  });

  it('starts undetermined on the memory stub', async () => {
    expect(await getCalendarPermissionStatus()).toBe('undetermined');
  });

  it('requestPermission grants via default stub', async () => {
    expect(await requestCalendarPermission()).toBe('granted');
    expect(await getCalendarPermissionStatus()).toBe('granted');
    expect(isCalendarPermissionGranted('granted')).toBe(true);
    expect(isCalendarPermissionGranted('denied')).toBe(false);
  });

  it('honors an injected adapter', async () => {
    setCalendarPermissionAdapter({
      getStatus: async () => 'denied',
      requestPermission: async () => 'denied',
    });
    expect(await requestCalendarPermission()).toBe('denied');
  });

  it('exposes progressive-permission style copy', () => {
    const copy = calendarPermissionCopy();
    expect(copy.title).toMatch(/calendar/i);
    expect(copy.cta.length).toBeGreaterThan(0);
    expect(copy.skip.length).toBeGreaterThan(0);
  });
});
