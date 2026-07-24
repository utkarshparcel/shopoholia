import { create } from 'zustand';

type LookbookState = {
  savedIds: Set<string>;
  toggle: (listingId: string) => void;
  isSaved: (listingId: string) => boolean;
};

export const useLookbookStore = create<LookbookState>((set, get) => ({
  savedIds: new Set(),
  toggle: (listingId) => {
    set((state) => {
      const next = new Set(state.savedIds);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return { savedIds: next };
    });
  },
  isSaved: (listingId) => get().savedIds.has(listingId),
}));
