import { WASTE_SHARE_WATERMARK } from "./waste.js";

/** Default TTL for ask-a-friend outfit polls (N38). */
export const ASK_FRIEND_POLL_TTL_MS = 72 * 60 * 60 * 1000;

export type AskFriendOption = {
  id: string;
  /** Short safe label for share (e.g. "Look A · navy + denim"). */
  label: string;
  /** Wardrobe item ids for calendar commit. */
  itemIds: string[];
  occasion?: string | null;
};

export type AskFriendVote = {
  optionId: string;
  voterKey?: string;
  at?: string;
};

export type AskFriendTally = {
  counts: Record<string, number>;
  total: number;
  /** Highest vote option; ties → null. */
  winnerId: string | null;
};

export function isAskFriendPollExpired(
  expiresAt: string | Date,
  now: Date = new Date(),
): boolean {
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() >= t;
}

/** Tally outfit option votes; ties yield winnerId null. */
export function tallyAskFriendVotes(
  options: AskFriendOption[],
  votes: AskFriendVote[],
): AskFriendTally {
  const counts: Record<string, number> = {};
  for (const o of options) counts[o.id] = 0;
  for (const v of votes) {
    if (!(v.optionId in counts)) continue;
    counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  let winnerId: string | null = null;
  let best = -1;
  let tie = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      winnerId = id;
      tie = false;
    } else if (n === best && n > 0) {
      tie = true;
    }
  }
  if (tie || best <= 0) winnerId = null;
  return { counts, total, winnerId };
}

export type AskFriendShareInput = {
  pollId: string;
  /** Unguessable public token for the link; without it the link carries pollId (legacy). */
  shareToken?: string;
  options: AskFriendOption[];
  origin?: string;
  watermark?: string;
};

export type AskFriendShareCard = {
  pollId: string;
  deepLink: string;
  shareText: string;
  watermark: string;
};

/**
 * WhatsApp share for 2–3 outfit picks (N38).
 * Deep link: `worn.app/p/outfit/{pollId}`.
 */
export function buildAskFriendShare(input: AskFriendShareInput): AskFriendShareCard {
  const origin = (input.origin ?? "https://worn.app").replace(/\/+$/, "");
  const watermark = input.watermark ?? WASTE_SHARE_WATERMARK;
  const deepLink = `${origin}/p/outfit/${input.shareToken ?? input.pollId}`;
  const lines = input.options.slice(0, 3).map((o, i) => {
    const letter = String.fromCharCode(65 + i);
    return `${letter}) ${o.label}`;
  });
  const shareText = [
    "Which look should I wear?",
    ...lines,
    deepLink,
    `— ${watermark}`,
  ].join("\n");
  return { pollId: input.pollId, deepLink, shareText, watermark };
}

/**
 * Resolve winner option for calendar commit; null if expired / no votes / tie.
 */
export function resolveAskFriendWinner(
  options: AskFriendOption[],
  votes: AskFriendVote[],
  expiresAt: string | Date,
  now: Date = new Date(),
): AskFriendOption | null {
  if (isAskFriendPollExpired(expiresAt, now)) return null;
  const { winnerId } = tallyAskFriendVotes(options, votes);
  if (!winnerId) return null;
  return options.find((o) => o.id === winnerId) ?? null;
}
