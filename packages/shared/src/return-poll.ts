import { WASTE_SHARE_WATERMARK } from "./waste.js";

/** Default TTL for “Should I return?” friend polls (N35). */
export const RETURN_POLL_TTL_MS = 48 * 60 * 60 * 1000;

export const ReturnPollChoice = {
  KEEP: "KEEP",
  RETURN: "RETURN",
} as const;

export type ReturnPollChoice = (typeof ReturnPollChoice)[keyof typeof ReturnPollChoice];

export type ReturnPollVote = {
  choice: ReturnPollChoice;
  voterKey?: string;
  at?: string;
};

export type ReturnPollTally = {
  keep: number;
  return: number;
  total: number;
  /** Majority; ties → null (no clear signal). */
  winner: ReturnPollChoice | null;
};

export function isReturnPollExpired(
  expiresAt: string | Date,
  now: Date = new Date(),
): boolean {
  const t = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() >= t;
}

export function returnPollExpiresAt(
  createdAt: Date = new Date(),
  ttlMs: number = RETURN_POLL_TTL_MS,
): Date {
  return new Date(createdAt.getTime() + ttlMs);
}

/** Tally keep/return votes; ties yield winner null. */
export function tallyReturnVotes(votes: ReturnPollVote[]): ReturnPollTally {
  let keep = 0;
  let ret = 0;
  for (const v of votes) {
    if (v.choice === "KEEP") keep += 1;
    else if (v.choice === "RETURN") ret += 1;
  }
  const total = keep + ret;
  let winner: ReturnPollChoice | null = null;
  if (keep > ret) winner = "KEEP";
  else if (ret > keep) winner = "RETURN";
  return { keep, return: ret, total, winner };
}

export type ReturnPollShareInput = {
  pollId: string;
  /** Unguessable public token for the link; without it the link carries pollId (legacy). */
  shareToken?: string;
  /** Redacted / safe item label (no PII). */
  itemLabel: string;
  origin?: string;
  watermark?: string;
};

export type ReturnPollShareCard = {
  pollId: string;
  deepLink: string;
  shareText: string;
  watermark: string;
};

/**
 * WhatsApp-ready “Should I return?” share (N35).
 * Deep link: `worn.app/p/return/{pollId}`.
 */
export function buildReturnPollShare(input: ReturnPollShareInput): ReturnPollShareCard {
  const origin = (input.origin ?? "https://worn.app").replace(/\/+$/, "");
  const watermark = input.watermark ?? WASTE_SHARE_WATERMARK;
  const label = String(input.itemLabel ?? "this piece").trim() || "this piece";
  const deepLink = `${origin}/p/return/${input.shareToken ?? input.pollId}`;
  const shareText = [
    `Should I return ${label}?`,
    "Tap KEEP or RETURN:",
    deepLink,
    `— ${watermark}`,
  ].join("\n");
  return { pollId: input.pollId, deepLink, shareText, watermark };
}
