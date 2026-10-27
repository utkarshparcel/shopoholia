import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from './session';

async function waitForPersistedSurface(surface: string) {
  await vi.waitFor(async () => {
    const raw = await AsyncStorage.getItem('worn-session');
    expect(raw).toBeTruthy();
    expect(raw).toContain(`"activeSurface":"${surface}"`);
  });
}

describe('session store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSessionStore.setState({
      phone: null,
      email: null,
      accessToken: null,
      refreshToken: null,
      coinBalance: 0,
      activeSurface: 'play',
      restoreFallbackToast: null,
    });
    await useSessionStore.persist.clearStorage();
  });

  it('defaults to the Play surface', () => {
    expect(useSessionStore.getState().activeSurface).toBe('play');
  });

  it('setActiveSurface switches surfaces', () => {
    useSessionStore.getState().setActiveSurface('closet');
    expect(useSessionStore.getState().activeSurface).toBe('closet');
    useSessionStore.getState().setActiveSurface('play');
    expect(useSessionStore.getState().activeSurface).toBe('play');
  });

  it('clear() resets the surface to Play', () => {
    useSessionStore.getState().setActiveSurface('closet');
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().activeSurface).toBe('play');
  });

  it('setSession does not clobber an existing surface', () => {
    useSessionStore.getState().setActiveSurface('closet');
    useSessionStore.getState().setSession({
      accessToken: 'a',
      refreshToken: 'b',
    });
    expect(useSessionStore.getState().activeSurface).toBe('closet');
  });

  it('persists activeSurface to AsyncStorage', async () => {
    useSessionStore.getState().setActiveSurface('closet');
    await waitForPersistedSurface('closet');
  });

  it('rehydrates activeSurface from AsyncStorage after restart', async () => {
    await AsyncStorage.setItem(
      'worn-session',
      JSON.stringify({ state: { activeSurface: 'closet' }, version: 0 }),
    );

    // Memory starts at Play (cold start); rehydrate restores Closet.
    expect(useSessionStore.getState().activeSurface).toBe('play');
    await useSessionStore.persist.rehydrate();
    expect(useSessionStore.getState().activeSurface).toBe('closet');
  });

  it('does not persist access tokens', async () => {
    useSessionStore.getState().setSession({
      accessToken: 'secret-token',
      refreshToken: 'secret-refresh',
    });
    useSessionStore.getState().setActiveSurface('closet');
    await waitForPersistedSurface('closet');

    const raw = await AsyncStorage.getItem('worn-session');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('secret-refresh');
  });

  it('corrupt AsyncStorage falls back to Play with toast (W005)', async () => {
    await AsyncStorage.setItem('worn-session', '{corrupt');
    await useSessionStore.persist.rehydrate();
    expect(useSessionStore.getState().activeSurface).toBe('play');
    await vi.waitFor(() => {
      expect(useSessionStore.getState().restoreFallbackToast).toMatch(/Play/i);
    });
  });
});
