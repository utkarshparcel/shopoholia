import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Index from '@/app/index';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => React.createElement('span', { 'data-testid': 'redirect' }, href),
}));

vi.mock('@/src/lib/features', () => ({ FEATURE_CLOSET: true }));

function signIn() {
  useSessionStore.getState().setSession({ accessToken: 'a', refreshToken: 'r' });
}

describe('entry route', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
    useClosetStore.setState({ onboardingSkipped: false, onboardingCompleted: false, demoAccount: null });
  });

  it('sends a signed-out user to login', () => {
    render(<Index />);
    expect(screen.getByTestId('redirect').textContent).toBe('/(auth)/login');
  });

  it('lands on Play by default', () => {
    signIn();
    render(<Index />);
    expect(screen.getByTestId('redirect').textContent).toBe('/(tabs)/feed');
  });

  it('restores a persisted Closet surface to onboarding, then to Today once onboarding is done', () => {
    signIn();
    useSessionStore.getState().setActiveSurface('closet');
    const first = render(<Index />);
    expect(screen.getByTestId('redirect').textContent).toBe('/(closet)/onboarding');
    first.unmount();

    useClosetStore.setState({ onboardingSkipped: true });
    render(<Index />);
    expect(screen.getByTestId('redirect').textContent).toBe('/(closet)/today');
  });

  it('waits for the persisted surface before choosing, so a Closet user never flashes Play', async () => {
    signIn();
    const persist = useSessionStore.persist;
    let finish: (() => void) | null = null;
    const hasHydrated = vi.spyOn(persist, 'hasHydrated').mockReturnValue(false);
    const onFinish = vi.spyOn(persist, 'onFinishHydration').mockImplementation((cb) => {
      finish = () => cb(useSessionStore.getState());
      return () => {};
    });

    const { container } = render(<Index />);
    expect(container.innerHTML).toBe('');

    useSessionStore.getState().setActiveSurface('closet');
    hasHydrated.mockReturnValue(true);
    await act(async () => finish?.());
    expect(screen.getByTestId('redirect').textContent).toBe('/(closet)/onboarding');
    hasHydrated.mockRestore();
    onFinish.mockRestore();
  });
});
