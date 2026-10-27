import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const netInfoMocks = vi.hoisted(() => {
  const listeners = new Set<
    (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => void
  >();
  return {
    listeners,
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: vi.fn(
      (
        listener: (state: {
          isConnected: boolean | null;
          isInternetReachable: boolean | null;
        }) => void,
      ) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    ),
    emit(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
      for (const l of listeners) l(state);
    },
  };
});

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: netInfoMocks.fetch,
    addEventListener: netInfoMocks.addEventListener,
  },
}));

import { useNetworkStatus, isOfflineFromNetInfo } from './useNetworkStatus';

describe('isOfflineFromNetInfo', () => {
  it('treats disconnected as offline', () => {
    expect(isOfflineFromNetInfo({ isConnected: false, isInternetReachable: null })).toBe(true);
  });

  it('treats no internet reachability as offline', () => {
    expect(isOfflineFromNetInfo({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('treats connected + reachable as online', () => {
    expect(isOfflineFromNetInfo({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('treats unknown reachability with connection as online', () => {
    expect(isOfflineFromNetInfo({ isConnected: true, isInternetReachable: null })).toBe(false);
  });
});

describe('useNetworkStatus (NetInfo)', () => {
  beforeEach(() => {
    netInfoMocks.listeners.clear();
    netInfoMocks.fetch.mockReset();
    netInfoMocks.addEventListener.mockClear();
    netInfoMocks.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  });

  it('reads initial NetInfo state and updates on events', async () => {
    let latest: { isOffline: boolean } | null = null;
    function Probe() {
      latest = useNetworkStatus();
      return null;
    }

    const { unmount } = render(<Probe />);
    await waitFor(() => {
      expect(latest?.isOffline).toBe(false);
    });
    expect(netInfoMocks.addEventListener).toHaveBeenCalled();

    await act(async () => {
      netInfoMocks.emit({ isConnected: false, isInternetReachable: false });
    });
    await waitFor(() => {
      expect(latest?.isOffline).toBe(true);
    });

    unmount();
    expect(netInfoMocks.listeners.size).toBe(0);
  });

  it('falls back to navigator.onLine when NetInfo fetch fails', async () => {
    netInfoMocks.fetch.mockRejectedValueOnce(new Error('netinfo unavailable'));
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });

    let latest: { isOffline: boolean } | null = null;
    function Probe() {
      latest = useNetworkStatus();
      return null;
    }

    const { unmount } = render(<Probe />);
    await waitFor(() => {
      expect(latest?.isOffline).toBe(true);
    });

    await act(async () => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => true,
      });
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(latest?.isOffline).toBe(false);
    });

    unmount();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
  });
});
