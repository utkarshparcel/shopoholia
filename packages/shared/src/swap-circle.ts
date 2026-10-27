/**
 * N37 — Invite-only closet swap circle (private barter among friends).
 */

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const SWAP_INVITE_WEB_BASE = "https://worn.app/c";
export const SWAP_INVITE_DEEP_PREFIX = "worn://swap-circle";

/** Generate an invite code (default 8 chars, Crockford-ish alphabet). */
export function generateSwapInviteCode(length = 8): string {
  const n = Math.max(4, Math.min(16, Math.floor(length)));
  let out = "";
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * INVITE_ALPHABET.length);
    out += INVITE_ALPHABET[idx]!;
  }
  return out;
}

export function normalizeSwapInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Public web invite URL. */
export function buildSwapInviteUrl(inviteCode: string): string {
  const code = normalizeSwapInviteCode(inviteCode);
  return `${SWAP_INVITE_WEB_BASE}/${code}`;
}

/** App deep link for join. */
export function buildSwapInviteDeepLink(inviteCode: string): string {
  const code = normalizeSwapInviteCode(inviteCode);
  return `${SWAP_INVITE_DEEP_PREFIX}/${code}`;
}

export function buildSwapInvitePayload(inviteCode: string) {
  const code = normalizeSwapInviteCode(inviteCode);
  return {
    inviteCode: code,
    inviteUrl: buildSwapInviteUrl(code),
    deepLink: buildSwapInviteDeepLink(code),
  };
}

export type SwapMembershipLike = {
  userId: string;
  role?: string;
};

/** True when userId appears in the circle membership set. */
export function isSwapCircleMember(
  members: Iterable<SwapMembershipLike | string>,
  userId: string,
): boolean {
  for (const m of members) {
    const id = typeof m === "string" ? m : m.userId;
    if (id === userId) return true;
  }
  return false;
}

export type SwapAuthzDenial =
  | "NOT_MEMBER"
  | "NOT_LISTED"
  | "OWN_ITEM"
  | "NOT_BORROWER"
  | "WRONG_STATUS";

/**
 * Membership gate for circle reads / invites / listing creation.
 * Returns null when allowed, or a denial reason.
 */
export function denyUnlessCircleMember(
  members: Iterable<SwapMembershipLike | string>,
  userId: string,
): SwapAuthzDenial | null {
  return isSwapCircleMember(members, userId) ? null : "NOT_MEMBER";
}

export type SwapListingAuthzLike = {
  ownerUserId: string;
  status: string;
  borrowerUserId?: string | null;
};

/** Member (not owner) may borrow a LISTED item. */
export function denyUnlessCanBorrow(
  members: Iterable<SwapMembershipLike | string>,
  listing: SwapListingAuthzLike,
  userId: string,
): SwapAuthzDenial | null {
  if (!isSwapCircleMember(members, userId)) return "NOT_MEMBER";
  if (listing.ownerUserId === userId) return "OWN_ITEM";
  if (listing.status !== "LISTED") return "NOT_LISTED";
  return null;
}

/** Borrower (or owner) may mark a BORROWED item returned. */
export function denyUnlessCanReturn(
  members: Iterable<SwapMembershipLike | string>,
  listing: SwapListingAuthzLike,
  userId: string,
): SwapAuthzDenial | null {
  if (!isSwapCircleMember(members, userId)) return "NOT_MEMBER";
  if (listing.status !== "BORROWED") return "WRONG_STATUS";
  if (listing.borrowerUserId === userId || listing.ownerUserId === userId) {
    return null;
  }
  return "NOT_BORROWER";
}
