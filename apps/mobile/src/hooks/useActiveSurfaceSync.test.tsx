import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/src/stores/session';
import { useActiveSurfaceSync } from './useActiveSurfaceSync';

const route = vi.hoisted(() => ({ segments: [] as string[] }));

vi.mock('expo-router', () => ({
  useSegments: () => route.segments,
}));

function renderSync(enabled = true) {
  return renderHook(({ on }) => useActiveSurfaceSync(on), { initialProps: { on: enabled } });
}

describe('useActiveSurfaceSync', () => {
  beforeEach(() => {
    route.segments = [];
    useSessionStore.setState({ activeSurface: 'play' });
  });

  it('switches the stored side to Closet when Play links into a Closet screen', () => {
    route.segments = ['checkout'];
    const hook = renderSync();
    expect(useSessionStore.getState().activeSurface).toBe('play');

    route.segments = ['(closet)', 'accountant'];
    hook.rerender({ on: true });
    expect(useSessionStore.getState().activeSurface).toBe('closet');
  });

  it('switches back to Play when a Play tab is on screen again', () => {
    useSessionStore.setState({ activeSurface: 'closet' });
    route.segments = ['(tabs)', 'feed'];
    renderSync();
    expect(useSessionStore.getState().activeSurface).toBe('play');
  });

  it('keeps the stored side on screens of neither side', () => {
    useSessionStore.setState({ activeSurface: 'closet' });
    for (const segments of [[], ['cart'], ['(auth)', 'login'], ['listing', '[id]']]) {
      route.segments = segments;
      renderSync().unmount();
    }
    expect(useSessionStore.getState().activeSurface).toBe('closet');
  });

  it('writes only when the side differs', () => {
    useSessionStore.setState({ activeSurface: 'closet' });
    const writes = vi.fn();
    const unsubscribe = useSessionStore.subscribe(writes);
    route.segments = ['(closet)', 'today'];
    const hook = renderSync();
    route.segments = ['(closet)', 'vault'];
    hook.rerender({ on: true });
    unsubscribe();
    expect(writes).not.toHaveBeenCalled();
  });

  it("doesn't write a sign-out's reset back while the Closet screen is still up", () => {
    useSessionStore.setState({ activeSurface: 'closet' });
    route.segments = ['(closet)', 'today'];
    const hook = renderSync();
    useSessionStore.getState().clear();
    hook.rerender({ on: true });
    expect(useSessionStore.getState().activeSurface).toBe('play');
  });

  it('waits until enabled (the splash gate, or Closet switched off)', () => {
    route.segments = ['(closet)', 'today'];
    const hook = renderSync(false);
    expect(useSessionStore.getState().activeSurface).toBe('play');
    hook.rerender({ on: true });
    expect(useSessionStore.getState().activeSurface).toBe('closet');
  });
});
