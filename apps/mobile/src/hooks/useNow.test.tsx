import { act, renderHook } from '@testing-library/react';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './useNow';

type Listener = (status: string) => void;

describe('useNow', () => {
  let listener: Listener | null = null;
  const remove = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    listener = null;
    remove.mockClear();
    vi.mocked(AppState.addEventListener).mockImplementation(((_: string, cb: Listener) => {
      listener = cb;
      return { remove };
    }) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks every interval while the app is active', () => {
    const { result } = renderHook(() => useNow(1_000));
    expect(result.current).toBe(1_000_000);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(1_003_000);
  });

  it('stops in the background and catches up on return', () => {
    const { result } = renderHook(() => useNow(1_000));
    act(() => listener?.('background'));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(1_000_000);
    act(() => listener?.('active'));
    expect(result.current).toBe(1_010_000);
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = renderHook(() => useNow(1_000));
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
