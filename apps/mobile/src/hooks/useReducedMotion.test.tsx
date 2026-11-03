import { act, renderHook, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion (native)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the system Reduce Motion setting, including later changes', async () => {
    let onChange: ((enabled: boolean) => void) | undefined;
    const remove = vi.fn();
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (enabled: boolean) => void,
    ) => {
      onChange = handler;
      return { remove };
    }) as never);

    const { result, unmount } = renderHook(() => useReducedMotion());

    await waitFor(() => expect(result.current).toBe(true));
    act(() => onChange?.(false));
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
