import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadWardrobeItem } from './client';

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiUrl: 'https://api.worn.test' } } },
}));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 201 }));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadWardrobeItem (S1-23)', () => {
  it('sends the closet profile the piece is added from', async () => {
    await uploadWardrobeItem('tok', 'file:///tee.jpg', { category: 'shirt', profileId: 'kid-1' });
    const form = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect(form.get('profileId')).toBe('kid-1');
  });

  it('sends no profile for the user’s own closet', async () => {
    await uploadWardrobeItem('tok', 'file:///tee.jpg', { category: 'shirt', profileId: null });
    const form = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect(form.has('profileId')).toBe(false);
  });
});
