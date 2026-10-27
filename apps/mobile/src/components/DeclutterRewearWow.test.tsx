import { render, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { DeclutterProgressRing } from './DeclutterProgressRing';
import { RewearStreakCelebrate } from './RewearStreakCelebrate';

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/src/lib/delightHaptics', () => ({
  delightHapticWoreIt: vi.fn(async () => true),
}));

describe('DeclutterProgressRing (W071)', () => {
  it('shows N/goal ring and share on complete', () => {
    const onShare = vi.fn();
    render(
      <DeclutterProgressRing progress={5} target={5} completed onShare={onShare} />,
    );
    expect(screen.getByTestId('declutter-progress-ring')).toBeTruthy();
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share on complete' })).toBeTruthy();
  });
});

describe('RewearStreakCelebrate (W072)', () => {
  it('shows milestone celebrate and stays static under Reduce Motion', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(
      <RewearStreakCelebrate
        streak={{
          currentStreak: 7,
          longestStreak: 7,
          todayLogged: true,
          lastWearOn: '2026-08-26',
          brokenByPurchase: false,
          label: '7-day rewear streak',
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('rewear-streak-milestone')).toBeTruthy();
    });
    expect(screen.getByText(/Habit > haul/i)).toBeTruthy();
    expect(screen.getByText(/Reduce Motion/i)).toBeTruthy();
  });
});
