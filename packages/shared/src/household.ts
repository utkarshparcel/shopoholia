/**
 * N26 — Household / shared closet membership + wardrobe ACL.
 */

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const HOUSEHOLD_INVITE_WEB_BASE = "https://worn.app/h";
export const HOUSEHOLD_INVITE_DEEP_PREFIX = "worn://household";

export function generateHouseholdInviteCode(length = 8): string {
  const n = Math.max(4, Math.min(16, Math.floor(length)));
  let out = "";
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * INVITE_ALPHABET.length);
    out += INVITE_ALPHABET[idx]!;
  }
  return out;
}

export function normalizeHouseholdInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildHouseholdInviteUrl(inviteCode: string): string {
  const code = normalizeHouseholdInviteCode(inviteCode);
  return `${HOUSEHOLD_INVITE_WEB_BASE}/${code}`;
}

export function buildHouseholdInviteDeepLink(inviteCode: string): string {
  const code = normalizeHouseholdInviteCode(inviteCode);
  return `${HOUSEHOLD_INVITE_DEEP_PREFIX}/${code}`;
}

export function buildHouseholdInvitePayload(inviteCode: string) {
  const code = normalizeHouseholdInviteCode(inviteCode);
  return {
    inviteCode: code,
    inviteUrl: buildHouseholdInviteUrl(code),
    deepLink: buildHouseholdInviteDeepLink(code),
  };
}

export type HouseholdMembershipLike = {
  userId: string;
  role?: string;
};

export function isHouseholdMember(
  members: Iterable<HouseholdMembershipLike | string>,
  userId: string,
): boolean {
  for (const m of members) {
    const id = typeof m === "string" ? m : m.userId;
    if (id === userId) return true;
  }
  return false;
}

export type HouseholdAuthzDenial = "NOT_MEMBER" | "NOT_OWNER" | "OUTSIDER";

/** Membership gate for household reads / shared wardrobe. */
export function denyUnlessHouseholdMember(
  members: Iterable<HouseholdMembershipLike | string>,
  userId: string,
): HouseholdAuthzDenial | null {
  return isHouseholdMember(members, userId) ? null : "NOT_MEMBER";
}

/** Owner-only actions (e.g. regenerate invite). */
export function denyUnlessHouseholdOwner(
  members: Iterable<HouseholdMembershipLike>,
  userId: string,
): HouseholdAuthzDenial | null {
  for (const m of members) {
    if (m.userId === userId && (m.role === "OWNER" || m.role === "owner")) {
      return null;
    }
  }
  return isHouseholdMember(members, userId) ? "NOT_OWNER" : "NOT_MEMBER";
}

/**
 * Shared wardrobe ACL: member may read/update laundry for any household
 * member's item; outsiders denied.
 */
export function denyUnlessCanAccessHouseholdWardrobe(
  members: Iterable<HouseholdMembershipLike | string>,
  itemOwnerUserId: string,
  actorUserId: string,
): HouseholdAuthzDenial | null {
  if (!isHouseholdMember(members, actorUserId)) return "NOT_MEMBER";
  if (!isHouseholdMember(members, itemOwnerUserId)) return "OUTSIDER";
  return null;
}

/** Collect user ids of household members for shared wardrobe listing. */
export function householdMemberUserIds(
  members: Iterable<HouseholdMembershipLike | string>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    const id = typeof m === "string" ? m : m.userId;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * W064 — friendly ACL copy for 403 / authz denials (mobile + API messages).
 */
export function friendlyHouseholdAclCopy(
  reasonOrMessage: string | HouseholdAuthzDenial | null | undefined,
): string {
  const raw = (reasonOrMessage ?? "").toString().trim();
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (
    upper === "NOT_MEMBER" ||
    /not a member/i.test(raw) ||
    /not.*member.*household/i.test(raw)
  ) {
    return "You’re not in this household. Ask for a fresh invite code.";
  }
  if (upper === "NOT_OWNER" || /only the household owner/i.test(raw)) {
    return "Only the household owner can do that. Ask them to help.";
  }
  if (upper === "OUTSIDER" || /not in this household/i.test(raw)) {
    return "That piece isn’t in your shared closet.";
  }
  if (/403|forbidden/i.test(raw)) {
    return "You don’t have access to this shared closet.";
  }
  return raw || "You don’t have access to this shared closet.";
}

/** W064 — clear active household label for the switcher. */
export function activeHouseholdSwitcherLabel(
  household: { name: string } | null | undefined,
): string {
  const name = household?.name?.trim();
  if (!name) return "No household selected";
  return `Active: ${name}`;
}
