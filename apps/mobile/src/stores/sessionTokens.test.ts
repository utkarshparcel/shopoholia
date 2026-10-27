import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = vi.hoisted(() => {
  const items = new Map<string, string>();
  return {
    items,
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: vi.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

vi.mock('expo-secure-store', () => secure);

const KEY = 'worn.session.v1';
const SESSION = { accessToken: 'a1', refreshToken: 'r1', phone: '919876543210', email: null };

async function load() {
  vi.resetModules();
  const tokens = await import('./sessionTokens');
  const session = await import('./session');
  return { ...tokens, ...session };
}

beforeEach(async () => {
  secure.items.clear();
  secure.getItemAsync.mockClear();
  secure.setItemAsync.mockClear();
  secure.deleteItemAsync.mockClear();
  await AsyncStorage.clear();
});

describe('stored session (native)', () => {
  it('reads back what was saved, and nothing before that', async () => {
    const { readStoredSession, saveStoredSession } = await load();
    expect(await readStoredSession()).toBeNull();
    await saveStoredSession(SESSION);
    expect(await readStoredSession()).toEqual(SESSION);
    expect(secure.setItemAsync).toHaveBeenCalledWith(KEY, JSON.stringify(SESSION), {
      keychainAccessible: 0,
    });
  });

  it('removes an entry it cannot read instead of failing every launch', async () => {
    secure.items.set(KEY, '{"accessToken":42}');
    const { readStoredSession } = await load();
    expect(await readStoredSession()).toBeNull();
    expect(secure.items.has(KEY)).toBe(false);
  });

  it('writes one at a time and ends on the newest value', async () => {
    const { saveStoredSession } = await load();
    let release!: () => void;
    secure.setItemAsync.mockImplementationOnce(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          release = () => {
            secure.items.set(key, value);
            resolve();
          };
        }),
    );

    void saveStoredSession(SESSION);
    void saveStoredSession({ ...SESSION, accessToken: 'a2' });
    const done = saveStoredSession(null);
    await vi.waitFor(() => expect(secure.setItemAsync).toHaveBeenCalledTimes(1));
    release();
    await done;

    // The renewal queued behind the first write was superseded by the sign-out.
    expect(secure.setItemAsync).toHaveBeenCalledTimes(1);
    expect(secure.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(secure.items.has(KEY)).toBe(false);
  });

  it('skips a write when the session has not changed', async () => {
    const { saveStoredSession } = await load();
    await saveStoredSession(SESSION);
    await saveStoredSession({ ...SESSION });
    expect(secure.setItemAsync).toHaveBeenCalledTimes(1);
  });
});

describe('startSessionTokenPersistence', () => {
  it('waits for the stored session, then restores it', async () => {
    secure.items.set(KEY, JSON.stringify(SESSION));
    const { useSessionStore, startSessionTokenPersistence } = await load();
    expect(useSessionStore.getState().tokensHydrated).toBe(false);

    await startSessionTokenPersistence();

    const state = useSessionStore.getState();
    expect(state.tokensHydrated).toBe(true);
    expect(state.accessToken).toBe('a1');
    expect(state.refreshToken).toBe('r1');
    expect(state.phone).toBe('919876543210');
  });

  it('stores renewals and removes the session on sign-out', async () => {
    const { useSessionStore, startSessionTokenPersistence } = await load();
    await startSessionTokenPersistence();

    useSessionStore.getState().setSession({ accessToken: 'a1', refreshToken: 'r1', phone: '1' });
    await vi.waitFor(() => expect(secure.items.get(KEY)).toContain('"accessToken":"a1"'));

    useSessionStore.getState().setTokens({ accessToken: 'a2', refreshToken: 'r2' });
    await vi.waitFor(() => expect(secure.items.get(KEY)).toContain('"refreshToken":"r2"'));

    useSessionStore.getState().clear();
    await vi.waitFor(() => expect(secure.items.has(KEY)).toBe(false));
  });

  it('keeps a sign-in that finished while the store was being read', async () => {
    secure.items.set(KEY, JSON.stringify(SESSION));
    const { useSessionStore, startSessionTokenPersistence } = await load();
    secure.getItemAsync.mockImplementationOnce(async (key: string) => {
      useSessionStore.getState().setSession({ accessToken: 'fresh', refreshToken: 'fresh-r' });
      return secure.items.get(key) ?? null;
    });

    await startSessionTokenPersistence();

    expect(useSessionStore.getState().accessToken).toBe('fresh');
    await vi.waitFor(() => expect(secure.items.get(KEY)).toContain('"accessToken":"fresh"'));
  });

  it('moves tokens an older build left in AsyncStorage into the secure store', async () => {
    await AsyncStorage.setItem(
      'worn-session',
      JSON.stringify({
        state: { activeSurface: 'play', accessToken: 'old-a', refreshToken: 'old-r', phone: null },
        version: 0,
      }),
    );
    const { useSessionStore, startSessionTokenPersistence } = await load();

    await startSessionTokenPersistence();

    expect(useSessionStore.getState().accessToken).toBe('old-a');
    const raw = (await AsyncStorage.getItem('worn-session')) ?? '';
    expect(raw).not.toContain('old-a');
    expect(raw).not.toContain('old-r');
    await vi.waitFor(() => expect(secure.items.get(KEY)).toContain('"accessToken":"old-a"'));
  });

  it('starts signed out when the secure store cannot be read', async () => {
    secure.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    const { useSessionStore, startSessionTokenPersistence } = await load();

    await startSessionTokenPersistence();

    expect(useSessionStore.getState().tokensHydrated).toBe(true);
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});

describe('web', () => {
  it('keeps tokens in memory only', async () => {
    vi.resetModules();
    vi.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    try {
      const tokens = await import('./sessionTokens');
      const { useSessionStore, startSessionTokenPersistence } = await import('./session');
      expect(tokens.SESSION_TOKENS_PERSISTED).toBe(false);
      expect(useSessionStore.getState().tokensHydrated).toBe(true);

      await startSessionTokenPersistence();
      useSessionStore.getState().setSession({ accessToken: 'web-a', refreshToken: 'web-r' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(secure.setItemAsync).not.toHaveBeenCalled();
      expect(secure.getItemAsync).not.toHaveBeenCalled();
      expect((await AsyncStorage.getItem('worn-session')) ?? '').not.toContain('web-a');
    } finally {
      vi.doUnmock('react-native');
    }
  });
});
