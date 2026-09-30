import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchLookbook, removeFromLookbook, saveToLookbook } from '@/src/api/client';
import { useLookbookStore } from '@/src/stores/lookbook';
import { useSessionStore } from '@/src/stores/session';

vi.mock('@/src/api/client', () => ({
  fetchLookbook: vi.fn(),
  saveToLookbook: vi.fn(),
  removeFromLookbook: vi.fn(),
}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function card(id: string) {
  return { id, title: 'Tee', category: 'Tops', coinPrice: 40, houseModelImageUrl: 'https://cdn.test/t.jpg' };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** An access token shaped like the API's: only the `sub` claim matters here. */
const jwtFor = (sub: string, n: number) =>
  `h.${btoa(JSON.stringify({ sub, n })).replace(/=+$/, '')}.sig`;
const lookbook = () => useLookbookStore.getState();
const saved = () => [...lookbook().savedIds].sort();

async function signIn(ids: string[] = [], accessToken = 'token-1') {
  vi.mocked(fetchLookbook).mockResolvedValueOnce({ items: ids.map(card) });
  useSessionStore.getState().setSession({ accessToken, refreshToken: 'refresh' });
  await flush();
}

beforeEach(() => {
  vi.mocked(fetchLookbook).mockReset();
  vi.mocked(saveToLookbook).mockReset().mockResolvedValue(undefined);
  vi.mocked(removeFromLookbook).mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().clear();
});

describe('lookbook store', () => {
  it('loads the saved listings after sign-in and clears them on sign-out', async () => {
    await signIn([A, B]);

    expect(fetchLookbook).toHaveBeenCalledWith('token-1');
    expect(saved()).toEqual([A, B]);
    expect(lookbook().isSaved(A)).toBe(true);

    useSessionStore.getState().clear();
    expect(saved()).toEqual([]);
  });

  it('keeps the saved set when the session is renewed for the same user', async () => {
    await signIn([A, B], jwtFor('user-1', 1));
    vi.mocked(fetchLookbook).mockClear();

    useSessionStore.getState().setTokens({ accessToken: jwtFor('user-1', 2), refreshToken: 'r2' });
    await flush();

    expect(fetchLookbook).not.toHaveBeenCalled();
    expect(saved()).toEqual([A, B]);
  });

  it('saves and removes optimistically, then confirms with the server', async () => {
    await signIn([B]);
    const revision = lookbook().revision;
    const request = deferred();
    vi.mocked(saveToLookbook).mockReturnValueOnce(request.promise);

    const saving = lookbook().toggle(A);
    expect(lookbook().isSaved(A)).toBe(true);
    expect(saveToLookbook).toHaveBeenCalledWith('token-1', A);
    request.resolve();
    await saving;
    expect(saved()).toEqual([A, B]);

    const removing = lookbook().toggle(B);
    expect(lookbook().isSaved(B)).toBe(false);
    await removing;
    expect(removeFromLookbook).toHaveBeenCalledWith('token-1', B);
    expect(saved()).toEqual([A]);
    expect(lookbook().revision).toBe(revision + 2);
  });

  it('rolls back a save or removal the server rejects', async () => {
    await signIn([B]);
    const revision = lookbook().revision;
    vi.mocked(saveToLookbook).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(removeFromLookbook).mockRejectedValueOnce(new Error('offline'));

    await lookbook().toggle(A);
    await lookbook().toggle(B);

    expect(saved()).toEqual([B]);
    expect(lookbook().revision).toBe(revision);
  });

  it('sends a double tap in order and ends up matching the last tap', async () => {
    await signIn();
    const request = deferred();
    vi.mocked(saveToLookbook).mockReturnValueOnce(request.promise);

    const first = lookbook().toggle(A);
    const second = lookbook().toggle(A);
    expect(lookbook().isSaved(A)).toBe(false);
    expect(removeFromLookbook).not.toHaveBeenCalled();

    request.resolve();
    await Promise.all([first, second]);
    expect(removeFromLookbook).toHaveBeenCalledWith('token-1', A);
    expect(vi.mocked(saveToLookbook).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(removeFromLookbook).mock.invocationCallOrder[0]!,
    );
    expect(saved()).toEqual([]);
  });

  it('skips the undo request when the save it undoes failed', async () => {
    await signIn();
    const request = deferred();
    vi.mocked(saveToLookbook).mockReturnValueOnce(request.promise);

    const first = lookbook().toggle(A);
    void lookbook().toggle(A);
    request.reject(new Error('offline'));
    await first;

    expect(removeFromLookbook).not.toHaveBeenCalled();
    expect(saved()).toEqual([]);
  });

  it('keeps taps made while the saved list is loading', async () => {
    const load = deferred<{ items: ReturnType<typeof card>[] }>();
    vi.mocked(fetchLookbook).mockReturnValueOnce(load.promise);
    useSessionStore.getState().setSession({ accessToken: 'token-1', refreshToken: 'refresh' });

    // B is saved before the list arrives, and the list predates that save.
    await lookbook().toggle(B);
    load.resolve({ items: [card(A)] });
    await flush();

    expect(saved()).toEqual([A, B]);
  });

  it('drops responses that arrive after sign-out', async () => {
    await signIn([A]);
    const revision = lookbook().revision;
    const request = deferred();
    vi.mocked(saveToLookbook).mockReturnValueOnce(request.promise);

    const saving = lookbook().toggle(B);
    useSessionStore.getState().clear();
    request.resolve();
    await saving;

    expect(saved()).toEqual([]);
    expect(lookbook().revision).toBe(revision);
  });

  it('starts from the new account’s list on an account switch and ignores taps when signed out', async () => {
    await signIn([A]);
    await signIn([C], 'token-2');
    expect(fetchLookbook).toHaveBeenLastCalledWith('token-2');
    expect(saved()).toEqual([C]);

    useSessionStore.getState().clear();
    await lookbook().toggle(A);
    expect(saveToLookbook).not.toHaveBeenCalled();
    expect(saved()).toEqual([]);
  });
});
