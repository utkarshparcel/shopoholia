import { create } from 'zustand';

import {
  fetchLookbook,
  removeFromLookbook,
  saveToLookbook,
  type LookbookItem,
} from '@/src/api/client';
import { useSessionStore } from '@/src/stores/session';

type LookbookState = {
  savedIds: Set<string>;
  /** Bumps whenever the server confirms a save or a removal. */
  revision: number;
  /** Fetches the saved items and adopts them as the saved set. */
  load: () => Promise<LookbookItem[]>;
  /** Flips the saved state straight away, then syncs it; reverts if the server refuses. */
  toggle: (listingId: string) => Promise<void>;
  isSaved: (listingId: string) => boolean;
  reset: () => void;
};

// Sync bookkeeping that no screen renders, so it lives outside the store state.
let session = 0; // bumped by reset(), so requests from a previous session can't write back
let clock = 0; // orders local changes against load() requests
const confirmed = new Set<string>(); // what the server holds, as far as we know
const changedAt = new Map<string, number>(); // listingId -> clock at its last local change
const syncing = new Map<string, Promise<void>>();

export const useLookbookStore = create<LookbookState>((set, get) => {
  const setSaved = (listingId: string, saved: boolean) =>
    set((state) => {
      if (state.savedIds.has(listingId) === saved) return state;
      const savedIds = new Set(state.savedIds);
      if (saved) savedIds.add(listingId);
      else savedIds.delete(listingId);
      return { savedIds };
    });

  // One request at a time per listing, repeated until the server matches the latest tap, so
  // quick double taps can't land out of order. A failed request restores the server's state.
  const sync = async (listingId: string, accessToken: string, from: number) => {
    for (;;) {
      const want = get().savedIds.has(listingId);
      if (from !== session || want === confirmed.has(listingId)) return;
      try {
        await (want ? saveToLookbook : removeFromLookbook)(accessToken, listingId);
      } catch {
        if (from !== session) return;
        changedAt.set(listingId, ++clock);
        setSaved(listingId, confirmed.has(listingId));
        return;
      }
      if (from !== session) return;
      if (want) confirmed.add(listingId);
      else confirmed.delete(listingId);
      changedAt.set(listingId, ++clock);
      set((state) => ({ revision: state.revision + 1 }));
    }
  };

  return {
    savedIds: new Set(),
    revision: 0,

    load: async () => {
      const { accessToken } = useSessionStore.getState();
      if (!accessToken) return [];
      const from = session;
      const requestedAt = clock;
      const { items } = await fetchLookbook(accessToken);
      if (from !== session) return items;

      // Listings tapped since the request went out keep their local state.
      const local = (id: string) => syncing.has(id) || (changedAt.get(id) ?? 0) > requestedAt;
      const savedIds = new Set([...get().savedIds].filter(local));
      for (const id of confirmed) if (!local(id)) confirmed.delete(id);
      for (const { id } of items) {
        if (local(id)) continue;
        savedIds.add(id);
        confirmed.add(id);
      }
      set({ savedIds });
      return items;
    },

    toggle: (listingId) => {
      const { accessToken } = useSessionStore.getState();
      if (!accessToken) return Promise.resolve();
      changedAt.set(listingId, ++clock);
      setSaved(listingId, !get().savedIds.has(listingId));

      const running = syncing.get(listingId);
      if (running) return running;
      const run = sync(listingId, accessToken, session).finally(() => {
        if (syncing.get(listingId) === run) syncing.delete(listingId);
      });
      syncing.set(listingId, run);
      return run;
    },

    isSaved: (listingId) => get().savedIds.has(listingId),

    reset: () => {
      session += 1;
      confirmed.clear();
      changedAt.clear();
      syncing.clear();
      set({ savedIds: new Set() });
    },
  };
});

// Follow the session: each sign-in (or account switch) starts from the server's copy, and
// signing out clears it. A failed load leaves the set empty; the Lookbook tab loads again.
useSessionStore.subscribe((state, prev) => {
  if (state.accessToken === prev.accessToken) return;
  useLookbookStore.getState().reset();
  if (state.accessToken) void useLookbookStore.getState().load().catch(() => undefined);
});

// The session may already be set by the time this module is first imported.
if (useSessionStore.getState().accessToken) {
  void useLookbookStore.getState().load().catch(() => undefined);
}
