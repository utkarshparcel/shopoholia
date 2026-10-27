import { randomUUID } from "node:crypto";
import {
  ASK_FRIEND_POLL_TTL_MS,
  RETURN_POLL_TTL_MS,
  type AskFriendOption,
  type AskFriendTally,
  type ReturnPollChoice,
  type ReturnPollTally,
  isAskFriendPollExpired,
  isReturnPollExpired,
  returnPollExpiresAt,
} from "@worn/shared";
import type { Repositories, SocialPollRecord } from "./repositories/types.js";
import { hashShareToken, pollShareToken, pollVoterHash } from "./privacy-hmac.js";

export type { SocialPollRecord };

export type ReturnPollRecord = SocialPollRecord & { kind: "return"; itemLabel: string };
export type AskFriendPollRecord = SocialPollRecord & { kind: "outfit"; options: AskFriendOption[] };

export type PollWithCounts<P extends SocialPollRecord> = {
  poll: P;
  /** Votes per choice (KEEP / RETURN, or option id). */
  counts: Record<string, number>;
};

export type VoteResult<P extends SocialPollRecord> =
  | (PollWithCounts<P> & { inserted: boolean })
  | { error: "not_found" | "expired" | "bad_option" | "already_voted" };

/** Same result as `tallyReturnVotes`, from per-choice counts (the votes stay in Postgres). */
export function tallyReturnCounts(counts: Record<string, number>): ReturnPollTally {
  const keep = counts.KEEP ?? 0;
  const ret = counts.RETURN ?? 0;
  const winner: ReturnPollChoice | null = keep > ret ? "KEEP" : ret > keep ? "RETURN" : null;
  return { keep, return: ret, total: keep + ret, winner };
}

/** Same result as `tallyAskFriendVotes`, from per-option counts. */
export function tallyAskFriendCounts(
  options: AskFriendOption[],
  counts: Record<string, number>,
): AskFriendTally {
  const out: Record<string, number> = {};
  for (const o of options) out[o.id] = counts[o.id] ?? 0;
  const total = Object.values(out).reduce((s, n) => s + n, 0);
  let winnerId: string | null = null;
  let best = -1;
  let tie = false;
  for (const [id, n] of Object.entries(out)) {
    if (n > best) {
      best = n;
      winnerId = id;
      tie = false;
    } else if (n === best && n > 0) {
      tie = true;
    }
  }
  if (tie || best <= 0) winnerId = null;
  return { counts: out, total, winnerId };
}

function isReturn(poll: SocialPollRecord | null): poll is ReturnPollRecord {
  return poll?.kind === "return";
}

function isOutfit(poll: SocialPollRecord | null): poll is AskFriendPollRecord {
  return poll?.kind === "outfit";
}

/**
 * Friend polls (N35 return, N38 ask-a-friend) in Postgres (`social_polls`, `social_poll_votes`).
 * The share link carries an HMAC token of the poll id; the database keeps only its sha256, and
 * votes keep only an HMAC of the voter key, one vote per voter (enforced by a unique key).
 */
export function createSocialPollStore(repos: Repositories) {
  async function create(input: Omit<SocialPollRecord, "id" | "tokenHash" | "createdAt" | "winnerAppliedAt" | "closedAt">) {
    const id = randomUUID();
    const shareToken = pollShareToken(id);
    const poll = await repos.createSocialPoll({ ...input, id, tokenHash: hashShareToken(shareToken) });
    return { poll, shareToken };
  }

  async function vote<P extends SocialPollRecord>(
    poll: P,
    choice: string,
    voterKey: string,
    expired: boolean,
  ): Promise<VoteResult<P>> {
    if (expired) return { error: "expired" };
    const cast = await repos.castSocialPollVote(poll.id, pollVoterHash(poll.id, voterKey), choice);
    // A retry of the same vote is fine; changing it is not.
    if (!cast.inserted && cast.choice !== choice) return { error: "already_voted" };
    return { poll, counts: await repos.countSocialPollVotes(poll.id), inserted: cast.inserted };
  }

  return {
    shareTokenFor: pollShareToken,

    async createReturnPoll(input: {
      userId: string;
      itemLabel: string;
      returnRequestId?: string | null;
      ttlMs?: number;
      now?: Date;
    }): Promise<{ poll: ReturnPollRecord; shareToken: string }> {
      const now = input.now ?? new Date();
      const { poll, shareToken } = await create({
        userId: input.userId,
        kind: "return",
        itemLabel: input.itemLabel,
        returnRequestId: input.returnRequestId ?? null,
        options: [],
        plannedFor: null,
        expiresAt: returnPollExpiresAt(now, input.ttlMs ?? RETURN_POLL_TTL_MS),
      });
      return { poll: poll as ReturnPollRecord, shareToken };
    },

    async createAskFriendPoll(input: {
      userId: string;
      options: AskFriendOption[];
      plannedFor?: string | null;
      ttlMs?: number;
      now?: Date;
    }): Promise<{ poll: AskFriendPollRecord; shareToken: string }> {
      const now = input.now ?? new Date();
      const opts = input.options.slice(0, 3);
      if (opts.length < 2) {
        throw new Error("Ask-friend poll needs 2–3 outfit options");
      }
      if (new Set(opts.map((o) => o.id)).size !== opts.length) {
        throw new Error("Outfit option ids must be unique");
      }
      const { poll, shareToken } = await create({
        userId: input.userId,
        kind: "outfit",
        itemLabel: null,
        returnRequestId: null,
        options: opts,
        plannedFor: input.plannedFor ?? null,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? ASK_FRIEND_POLL_TTL_MS)),
      });
      return { poll: poll as AskFriendPollRecord, shareToken };
    },

    /** The owner's poll by id; null for anyone else (callers answer 404). */
    async getOwned<K extends SocialPollRecord["kind"]>(
      id: string,
      userId: string,
      kind: K,
    ): Promise<PollWithCounts<K extends "return" ? ReturnPollRecord : AskFriendPollRecord> | null> {
      const poll = await repos.findSocialPollById(id);
      if (!poll || poll.userId !== userId || poll.kind !== kind) return null;
      return {
        poll: poll as K extends "return" ? ReturnPollRecord : AskFriendPollRecord,
        counts: await repos.countSocialPollVotes(poll.id),
      };
    },

    /** A poll by its share token (the public link). */
    async getByToken<K extends SocialPollRecord["kind"]>(
      token: string,
      kind: K,
    ): Promise<PollWithCounts<K extends "return" ? ReturnPollRecord : AskFriendPollRecord> | null> {
      const poll = await repos.findSocialPollByTokenHash(hashShareToken(token));
      if (!poll || poll.kind !== kind) return null;
      return {
        poll: poll as K extends "return" ? ReturnPollRecord : AskFriendPollRecord,
        counts: await repos.countSocialPollVotes(poll.id),
      };
    },

    async voteReturn(
      poll: SocialPollRecord | null,
      choice: ReturnPollChoice,
      voterKey: string,
      now = new Date(),
    ): Promise<VoteResult<ReturnPollRecord>> {
      if (!isReturn(poll)) return { error: "not_found" };
      return vote(poll, choice, voterKey, isReturnPollExpired(poll.expiresAt, now));
    },

    async voteAskFriend(
      poll: SocialPollRecord | null,
      optionId: string,
      voterKey: string,
      now = new Date(),
    ): Promise<VoteResult<AskFriendPollRecord>> {
      if (!isOutfit(poll)) return { error: "not_found" };
      if (isAskFriendPollExpired(poll.expiresAt, now)) return { error: "expired" };
      if (!poll.options.some((o) => o.id === optionId)) return { error: "bad_option" };
      return vote(poll, optionId, voterKey, false);
    },

    /** True the first time; false when the winner was already applied. */
    markWinnerApplied(pollId: string): Promise<boolean> {
      return repos.markSocialPollWinnerApplied(pollId);
    },
  };
}

export type SocialPollStore = ReturnType<typeof createSocialPollStore>;

/** Winner option for the calendar; null when expired, without votes, or tied. */
export function askFriendWinnerForCalendar(
  poll: AskFriendPollRecord,
  counts: Record<string, number>,
  now: Date = new Date(),
): AskFriendOption | null {
  if (isAskFriendPollExpired(poll.expiresAt, now)) return null;
  const { winnerId } = tallyAskFriendCounts(poll.options, counts);
  if (!winnerId) return null;
  return poll.options.find((o) => o.id === winnerId) ?? null;
}
