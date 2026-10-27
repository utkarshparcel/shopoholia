/**
 * N27 — Kids / multi-profile closets: scope wardrobe & outfits by profile.
 */

export type ClosetProfileKind = "SELF" | "PARTNER" | "KID" | "OTHER";

export type ClosetProfileLike = {
  id: string;
  ownerUserId: string;
  householdId?: string | null;
  name: string;
  kind: ClosetProfileKind | string;
};

export type ProfileScopedItemLike = {
  profileId?: string | null;
  userId?: string;
};

/**
 * Scope wardrobe/outfit item pool to a profile.
 * - `profileId` set → only items with that profileId
 * - `profileId` null/undefined → all items (backward compatible)
 */
export function filterByClosetProfile<T extends ProfileScopedItemLike>(
  items: T[],
  profileId: string | null | undefined,
): T[] {
  if (!profileId) return items;
  return items.filter((i) => (i.profileId ?? null) === profileId);
}

/** Deny when actor does not own the profile (and is not household co-member — caller checks). */
export function denyUnlessOwnsProfile(
  profile: ClosetProfileLike | null | undefined,
  userId: string,
): "NOT_FOUND" | "FORBIDDEN" | null {
  if (!profile) return "NOT_FOUND";
  if (profile.ownerUserId !== userId) return "FORBIDDEN";
  return null;
}

/** Default display label for a new SELF profile. */
export function defaultSelfProfileName(): string {
  return "Me";
}

/** W065 — SELF cannot be deleted; kids/partner/other need confirm. */
export function canDeleteClosetProfile(
  profile: Pick<ClosetProfileLike, "kind"> | null | undefined,
): boolean {
  if (!profile) return false;
  return String(profile.kind).toUpperCase() !== "SELF";
}

export type ProfileDeleteConfirmCopy = {
  title: string;
  body: string;
  confirmLabel: string;
};

/** W065 — confirm-before-delete guardrails copy. */
export function profileDeleteConfirmCopy(
  profile: Pick<ClosetProfileLike, "name" | "kind">,
): ProfileDeleteConfirmCopy {
  const name = profile.name.trim() || "this profile";
  const kid = String(profile.kind).toUpperCase() === "KID";
  return {
    title: kid ? `Delete kids profile?` : `Delete profile?`,
    body: kid
      ? `Remove “${name}”? Their wardrobe list stays scoped — this only drops the profile switcher.`
      : `Remove “${name}”? Lists stay scoped to other profiles.`,
    confirmLabel: "Delete profile",
  };
}
