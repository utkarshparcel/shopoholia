import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logout } from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

import { signOut } from './signOut';

vi.mock('@/src/api/client', () => ({ logout: vi.fn() }));

beforeEach(() => {
  useSessionStore.getState().setSession({ accessToken: 'token-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  vi.mocked(logout).mockReset();
  useSessionStore.getState().clear();
});

describe('signOut', () => {
  it('clears the session at once and revokes the refresh token on the server', () => {
    vi.mocked(logout).mockReturnValue(new Promise(() => undefined));

    signOut();

    expect(useSessionStore.getState()).toMatchObject({ accessToken: null, refreshToken: null });
    expect(logout).toHaveBeenCalledWith('refresh-1');
  });

  it('still signs out when the server cannot be reached', async () => {
    vi.mocked(logout).mockRejectedValue(new TypeError('Network request failed'));

    expect(() => signOut()).not.toThrow();
    await Promise.resolve();

    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it('asks nothing of the server without a refresh token', () => {
    useSessionStore.getState().clear();

    signOut();

    expect(logout).not.toHaveBeenCalled();
  });
});
