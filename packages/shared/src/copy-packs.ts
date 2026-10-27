/**
 * W091 — Closet copy packs: Global EN + India Hinglish toggle.
 * Vault / Today strings switch together; no PII.
 */

export const COPY_PACK_IDS = ["en", "hinglish"] as const;
export type CopyPackId = (typeof COPY_PACK_IDS)[number];

export type ClosetCopyPack = {
  id: CopyPackId;
  label: string;
  /** Chip label for prefs UI. */
  chipLabel: string;
  vault: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyMessage: string;
    shareCta: string;
  };
  today: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyMessage: string;
  };
};

export const COPY_PACK_EN: ClosetCopyPack = {
  id: "en",
  label: "English",
  chipLabel: "EN",
  vault: {
    title: "Vault",
    subtitle: "Forgotten gift cards and store credit you already paid for.",
    emptyTitle: "Nothing in your vault yet",
    emptyMessage:
      "Add a gift card, snap a receipt, or try a sample — forgotten credit surfaces here.",
    shareCta: "Share found money",
  },
  today: {
    title: "Today",
    subtitle: "Outfit from what you own — Closet, not shopping.",
    emptyTitle: "No outfit yet",
    emptyMessage:
      "Add items to your wardrobe and we’ll generate one for the morning — found money stays in Vault.",
  },
};

/** India Hinglish — dual-track GTM creatives / Closet UI. */
export const COPY_PACK_HINGLISH: ClosetCopyPack = {
  id: "hinglish",
  label: "Hinglish",
  chipLabel: "Hinglish",
  vault: {
    title: "Vault",
    subtitle: "Bhooli hui gift cards / store credit — paisa jo pehle se hai.",
    emptyTitle: "Vault abhi empty hai",
    emptyMessage:
      "Ek gift card add karo, receipt snap karo, ya sample try karo — forgotten credit yahan dikhega.",
    shareCta: "Found money share karo",
  },
  today: {
    title: "Aaj",
    subtitle: "Jo kapde pehle se hain unse outfit — shopping nahi.",
    emptyTitle: "Aaj ka outfit nahi bana",
    emptyMessage:
      "Wardrobe mein pieces add karo — subah ka look yahin se. Found money Vault mein rehta hai.",
  },
};

export const COPY_PACKS: Record<CopyPackId, ClosetCopyPack> = {
  en: COPY_PACK_EN,
  hinglish: COPY_PACK_HINGLISH,
};

export const COPY_PACK_OPTIONS: readonly ClosetCopyPack[] = [COPY_PACK_EN, COPY_PACK_HINGLISH];

export function isCopyPackId(value: unknown): value is CopyPackId {
  return value === "en" || value === "hinglish";
}

export function getCopyPack(id: CopyPackId | null | undefined): ClosetCopyPack {
  if (id && isCopyPackId(id)) return COPY_PACKS[id];
  return COPY_PACK_EN;
}

/** Seed pack from currency region (IN → hinglish optional; else EN). */
export function defaultCopyPackFromCurrency(currency: string | null | undefined): CopyPackId {
  return currency === "INR" ? "hinglish" : "en";
}
