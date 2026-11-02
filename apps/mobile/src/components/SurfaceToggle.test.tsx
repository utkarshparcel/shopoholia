import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import { SurfaceToggle } from './SurfaceToggle';

const route = vi.hoisted(() => ({ segments: [] as string[], replace: vi.fn() }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: route.replace }),
  useSegments: () => route.segments,
}));

vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: true }));

describe('SurfaceToggle', () => {
  beforeEach(() => {
    route.replace.mockClear();
    useSessionStore.getState().clear();
    useSessionStore.getState().setSession({ accessToken: 'a', refreshToken: 'r' });
    useClosetPrefsStore.setState({ surfaceEduSeen: true });
    useClosetStore.setState({ onboardingSkipped: true, onboardingCompleted: false, demoAccount: null });
  });

  it('names Closet on a Play tab and switches there', () => {
    route.segments = ['(tabs)', 'feed'];
    render(<SurfaceToggle />);
    expect(screen.getByText('Closet →')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Worn Closet' }));
    expect(useSessionStore.getState().activeSurface).toBe('closet');
    expect(route.replace).toHaveBeenCalledWith('/(closet)/today');
  });

  it('names Play on a Closet tab and switches back to the feed', () => {
    useSessionStore.getState().setActiveSurface('closet');
    route.segments = ['(closet)', 'wardrobe'];
    render(<SurfaceToggle />);
    expect(screen.getByText('← Play')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Worn Play' }));
    expect(useSessionStore.getState().activeSurface).toBe('play');
    expect(route.replace).toHaveBeenCalledWith('/(tabs)/feed');
  });

  it('follows the side on screen when the stored side lags behind it', () => {
    route.segments = ['(closet)', 'accountant'];
    render(<SurfaceToggle />);
    expect(screen.getByText('← Play')).toBeTruthy();
  });

  it('hides off the bottom-nav screens and when signed out', () => {
    for (const segments of [['(auth)', 'login'], ['checkout'], ['(closet)', 'paywall'], ['(onboarding)', 'avatar']]) {
      route.segments = segments;
      const { container, unmount } = render(<SurfaceToggle />);
      expect(container.innerHTML).toBe('');
      unmount();
    }

    useSessionStore.getState().clear();
    route.segments = ['(tabs)', 'feed'];
    const { container } = render(<SurfaceToggle />);
    expect(container.innerHTML).toBe('');
  });

  it('explains the two sides once before the first switch', () => {
    useClosetPrefsStore.setState({ surfaceEduSeen: false });
    route.segments = ['(tabs)', 'lookbook'];
    render(<SurfaceToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Worn Closet' }));
    expect(screen.getByText('Two sides of WORN')).toBeTruthy();
    expect(route.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Got it'));
    expect(useClosetPrefsStore.getState().surfaceEduSeen).toBe(true);
    expect(useSessionStore.getState().activeSurface).toBe('closet');
    expect(route.replace).toHaveBeenCalledWith('/(closet)/today');
  });
});
