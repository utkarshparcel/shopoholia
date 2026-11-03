import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClosetWardrobeScreen from '@/app/(closet)/wardrobe';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';

const KID = '99999999-9999-4999-8999-999999999999';

const h = vi.hoisted(() => {
  type Mutation = { mutate: ReturnType<typeof vi.fn>; mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean };
  const mutations = new Map<string, Mutation>();
  const mutation = (name: string): Mutation => {
    let m = mutations.get(name);
    if (!m) {
      m = { mutate: vi.fn(), mutateAsync: vi.fn(async () => ({})), isPending: false };
      mutations.set(name, m);
    }
    return m;
  };
  const picked = { uris: [] as string[] };
  return { mutations, mutation, picked };
});

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(async () => ({
    canceled: false,
    assets: h.picked.uris.map((uri) => ({ uri })),
  })),
}));
vi.mock('@/src/lib/photoPrep', () => ({
  preparePhotosForUpload: vi.fn(async (assets: { uri: string }[]) => assets.map((a) => a.uri)),
}));
vi.mock('@/src/lib/features', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  FEATURE_CLOSET: true,
}));
vi.mock('@/src/components/AutotagConfirmSheet', () => ({
  AutotagConfirmSheet: ({ visible, drafts, onConfirm }: { visible: boolean; drafts: unknown[]; onConfirm: (d: unknown[]) => void }) =>
    visible ? createElement('button', { onClick: () => onConfirm(drafts) }, 'confirm-autotag') : null,
}));
// An empty closet shows the add form as the empty state's action; the profile chips are children.
vi.mock('@/src/components/ClosetScreen', () => ({
  ClosetScreen: ({ emptyAction, children }: { emptyAction?: unknown; children?: unknown }) =>
    createElement('div', null, createElement('section', { 'data-testid': 'empty' }, emptyAction as never), children as never),
}));
vi.mock('@/src/components/CompleteLookSheet', () => ({ CompleteLookSheet: () => null }));
vi.mock('@/src/components/MissingPieceShopSheet', () => ({ MissingPieceShopSheet: () => null }));
vi.mock('@/src/components/PhotoDumpReview', () => ({ PhotoDumpReview: () => null }));
vi.mock('@/src/components/ShoeBagRotationNudge', () => ({ ShoeBagRotationNudge: () => null }));
vi.mock('@/src/hooks/closet/useCloset', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(actual)) {
    if (!name.startsWith('use')) {
      out[name] = actual[name];
      continue;
    }
    out[name] = () => ({
      data:
        name === 'useClosetProfiles'
          ? { profiles: [{ id: KID, name: 'Mia', kind: 'KID' }], activeProfileId: null }
          : name === 'useWardrobe'
            ? { pages: [{ items: [] }], items: [] }
            : undefined,
      isLoading: false,
      isError: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      ...h.mutation(name),
    });
  }
  return out;
});

async function addPhotos(uris: string[]) {
  h.picked.uris = uris;
  await act(async () => {
    fireEvent.click(within(screen.getByTestId('empty')).getByLabelText('Add photos (multi-select)'));
  });
}

beforeEach(() => {
  h.mutations.clear();
  useClosetPrefsStore.setState({ preferredCurrency: 'INR' });
});

describe('wardrobe photo uploads', () => {
  it('S1-23: a photo added from a kid profile is filed under that profile', async () => {
    render(<ClosetWardrobeScreen />);
    fireEvent.click(screen.getByLabelText('Mia'));
    await addPhotos(['file:///one.jpg']);
    const upload = h.mutation('useUploadWardrobeItem');
    expect(upload.mutate).toHaveBeenCalledTimes(1);
    expect(upload.mutate.mock.calls[0]![0].meta.profileId).toBe(KID);
  });

  it('S1-23 / S1-24: a bulk import goes to the kid profile and copies no cost onto every photo', async () => {
    render(<ClosetWardrobeScreen />);
    fireEvent.click(screen.getByLabelText('Mia'));
    fireEvent.change(within(screen.getByTestId('empty')).getByPlaceholderText('Cost in INR (optional, one photo)'), {
      target: { value: '2000' },
    });
    await addPhotos(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    await act(async () => {
      fireEvent.click(screen.getAllByText('confirm-autotag')[0]!);
    });
    const bulk = h.mutation('useBulkUploadWardrobe');
    expect(bulk.mutate).toHaveBeenCalledTimes(1);
    const vars = bulk.mutate.mock.calls[0]![0] as {
      meta: { costMinor?: number; profileId?: string | null };
      perItemMeta: { costMinor?: number; profileId?: string | null }[];
    };
    expect(vars.perItemMeta).toHaveLength(3);
    for (const meta of [vars.meta, ...vars.perItemMeta]) {
      expect(meta.costMinor ?? 0).toBe(0);
      expect(meta.profileId).toBe(KID);
    }
  });

  it('S1-24: a single photo keeps the typed cost', async () => {
    render(<ClosetWardrobeScreen />);
    fireEvent.change(within(screen.getByTestId('empty')).getByPlaceholderText('Cost in INR (optional, one photo)'), {
      target: { value: '2000' },
    });
    await addPhotos(['file:///one.jpg']);
    const meta = h.mutation('useUploadWardrobeItem').mutate.mock.calls[0]![0].meta;
    expect(meta.costMinor).toBe(200000);
    expect(meta.profileId).toBeNull();
  });
});
