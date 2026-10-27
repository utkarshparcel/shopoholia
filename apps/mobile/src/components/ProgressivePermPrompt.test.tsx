import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.fn();

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/src/lib/pushPermission', () => ({
  isPushPermissionGranted: () => false,
  requestPushPermission: vi.fn(),
}));

import { ProgressivePermPrompt } from './ProgressivePermPrompt';
import { useClosetStore } from '@/src/stores/closet';

describe('ProgressivePermPrompt (W008)', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    useClosetStore.getState().clear();
    useClosetStore.setState({
      onboardingCompleted: true,
      foundMoneyTracked: true,
      delightStartedAt: Date.now() - 30_000,
      emailPromptSkipped: false,
      emailPromptCompleted: false,
      connectedSources: [],
    });
  });

  it('fires email_prompt_skipped with seconds when Not now is pressed', () => {
    render(<ProgressivePermPrompt />);
    fireEvent.click(screen.getByText('Not now'));
    expect(trackEvent).toHaveBeenCalledWith(
      'email_prompt_skipped',
      expect.objectContaining({ seconds: expect.any(Number) }),
    );
    expect(useClosetStore.getState().emailPromptSkipped).toBe(true);
    const seconds = (trackEvent.mock.calls[0]![1] as { seconds: number }).seconds;
    expect(seconds).toBeGreaterThanOrEqual(29);
  });
});
