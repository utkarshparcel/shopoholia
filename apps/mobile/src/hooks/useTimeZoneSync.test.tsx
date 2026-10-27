import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/src/stores/session';
import {
  resetTimeZoneSyncForTests,
  syncTimeZone,
  timeZoneSentKey,
  useTimeZoneSync,
} from './useTimeZoneSync';

const appState = vi.hoisted(() => ({
  listener: null as ((state: string) => void) | null,
  remove: vi.fn(),
}));
const api = vi.hoisted(() => ({ updateTimeZone: vi.fn() }));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (_type: string, listener: (state: string) => void) => {
      appState.listener = listener;
      return { remove: appState.remove };
    },
  },
}));
vi.mock('@/src/api/client', () => api);

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** An unsigned JWT whose `sub` is the user; only the payload is read on the device. */
function tokenFor(sub: string) {
  const payload = btoa(JSON.stringify({ sub })).replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function signIn(sub = USER_ID) {
  useSessionStore.setState({ accessToken: tokenFor(sub), refreshToken: 'refresh' });
}

const RealDateTimeFormat = Intl.DateTimeFormat;

/** The zone the device reports; formatters built for a given zone stay real (they validate it). */
function mockZone(timeZone: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((locales, options) =>
    options?.timeZone
      ? new RealDateTimeFormat(locales, options)
      : ({ resolvedOptions: () => ({ timeZone }) } as Intl.DateTimeFormat),
  );
}

describe('syncTimeZone (C1)', () => {
  beforeEach(async () => {
    resetTimeZoneSyncForTests();
    await AsyncStorage.clear();
    api.updateTimeZone.mockReset();
    api.updateTimeZone.mockImplementation(async (_token: string, timeZone: string) => ({
      timeZone,
    }));
    appState.listener = null;
    appState.remove.mockClear();
    useSessionStore.setState({ accessToken: null, refreshToken: null });
    mockZone('Asia/Kolkata');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the device zone once, then only when it changes', async () => {
    signIn();

    await syncTimeZone();
    await syncTimeZone();
    expect(api.updateTimeZone).toHaveBeenCalledTimes(1);
    expect(api.updateTimeZone).toHaveBeenCalledWith(tokenFor(USER_ID), 'Asia/Kolkata');
    expect(await AsyncStorage.getItem(timeZoneSentKey(USER_ID))).toBe('Asia/Kolkata');

    mockZone('Europe/London');
    await syncTimeZone();
    expect(api.updateTimeZone).toHaveBeenCalledTimes(2);
    expect(api.updateTimeZone).toHaveBeenLastCalledWith(tokenFor(USER_ID), 'Europe/London');
  });

  it('sends nothing while signed out', async () => {
    await syncTimeZone();
    expect(api.updateTimeZone).not.toHaveBeenCalled();
  });

  it('skips a zone the runtime reports that is not an IANA name', async () => {
    signIn();
    mockZone('Not/AZone');
    await syncTimeZone();
    expect(api.updateTimeZone).not.toHaveBeenCalled();
  });

  it('records nothing on failure, so the next call retries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    signIn();
    api.updateTimeZone.mockRejectedValueOnce(new Error('offline'));

    await syncTimeZone();
    expect(await AsyncStorage.getItem(timeZoneSentKey(USER_ID))).toBeNull();

    await syncTimeZone();
    expect(api.updateTimeZone).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(timeZoneSentKey(USER_ID))).toBe('Asia/Kolkata');
  });

  it('remembers the zone per user', async () => {
    signIn();
    await syncTimeZone();
    signIn('22222222-2222-4222-8222-222222222222');
    await syncTimeZone();
    expect(api.updateTimeZone).toHaveBeenCalledTimes(2);
  });

  it('sends one request when called twice at once', async () => {
    signIn();
    await Promise.all([syncTimeZone(), syncTimeZone()]);
    expect(api.updateTimeZone).toHaveBeenCalledTimes(1);
  });

  it('the hook syncs after sign-in and again when the app comes back', async () => {
    const { unmount } = renderHook(() => useTimeZoneSync());
    expect(appState.listener).toBeNull();

    act(() => signIn());
    await waitFor(() => expect(api.updateTimeZone).toHaveBeenCalledTimes(1));

    mockZone('America/New_York');
    act(() => appState.listener?.('background'));
    act(() => appState.listener?.('active'));
    await waitFor(() => expect(api.updateTimeZone).toHaveBeenCalledTimes(2));
    expect(api.updateTimeZone).toHaveBeenLastCalledWith(tokenFor(USER_ID), 'America/New_York');

    unmount();
    expect(appState.remove).toHaveBeenCalled();
  });
});
