import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';

import { formatMinor } from '@/src/lib/format';
import { resetFoundMoneyCountUpSession } from '@/src/lib/foundMoneyCountUp';

import { FoundMoneyCountUp } from './FoundMoneyCountUp';

afterEach(() => {
  resetFoundMoneyCountUpSession();
  vi.restoreAllMocks();
});

describe('FoundMoneyCountUp', () => {
  beforeEach(() => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  it('renders formatMinor total', async () => {
    render(<FoundMoneyCountUp totalMinor={50_000} />);
    await waitFor(() => {
      expect(screen.getByTestId('found-money-countup').textContent).toContain(
        formatMinor(50_000),
      );
    });
  });

  it('skips animation under Reduce Motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<FoundMoneyCountUp totalMinor={12_345} />);
    await waitFor(() => {
      expect(screen.getByTestId('found-money-countup').textContent).toBe(
        formatMinor(12_345),
      );
    });
  });

  it('animates only once per session', async () => {
    const { unmount } = render(<FoundMoneyCountUp totalMinor={10_000} />);
    await waitFor(() => {
      expect(screen.getByTestId('found-money-countup').textContent).toBe(
        formatMinor(10_000),
      );
    });
    unmount();
    render(<FoundMoneyCountUp totalMinor={20_000} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('found-money-countup').textContent).toBe(
      formatMinor(20_000),
    );
  });
});
