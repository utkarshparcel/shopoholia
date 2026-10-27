import { randomUUID } from "node:crypto";
import {
  ASK_FRIEND_POLL_TTL_MS,
  RETURN_POLL_TTL_MS,
  type AskFriendOption,
  type AskFriendVote,
  type ReturnPollChoice,
  type ReturnPollVote,
  isAskFriendPollExpired,
  isReturnPollExpired,
  returnPollExpiresAt,
  resolveAskFriendWinner,
  tallyAskFriendVotes,
  tallyReturnVotes,
} from "@worn/shared";

export type ReturnPollRecord = {
  id: string;
  kind: "return";
  userId: string;
  returnRequestId: string | null;
  itemLabel: string;
  votes: ReturnPollVote[];
  createdAt: Date;
  expiresAt: Date;
};

export type AskFriendPollRecord = {
  id: string;
  kind: "outfit";
  userId: string;
  options: AskFriendOption[];
  votes: AskFriendVote[];
  plannedFor: string | null;
  winnerAppliedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

export type SocialPollRecord = ReturnPollRecord | AskFriendPollRecord;

export type SocialPollStore = {
  createReturnPoll(input: {
    userId: string;
    itemLabel: string;
    returnRequestId?: string | null;
    ttlMs?: number;
    now?: Date;
  }): ReturnPollRecord;
  createAskFriendPoll(input: {
    userId: string;
    options: AskFriendOption[];
    plannedFor?: string | null;
    ttlMs?: number;
    now?: Date;
  }): AskFriendPollRecord;
  get(id: string): SocialPollRecord | null;
  voteReturn(
    id: string,
    choice: ReturnPollChoice,
    voterKey?: string,
    now?: Date,
  ): { poll: ReturnPollRecord; tally: ReturnType<typeof tallyReturnVotes> } | { error: string };
  voteAskFriend(
    id: string,
    optionId: string,
    voterKey?: string,
    now?: Date,
  ): { poll: AskFriendPollRecord; tally: ReturnType<typeof tallyAskFriendVotes> } | { error: string };
  markWinnerApplied(id: string, now?: Date): AskFriendPollRecord | null;
  clear(): void;
};

/** Ephemeral in-process poll store (N35 / N38). Fine for beta; swap for Redis later. */
export function createSocialPollStore(): SocialPollStore {
  const byId = new Map<string, SocialPollRecord>();

  return {
    createReturnPoll(input) {
      const now = input.now ?? new Date();
      const id = randomUUID();
      const record: ReturnPollRecord = {
        id,
        kind: "return",
        userId: input.userId,
        returnRequestId: input.returnRequestId ?? null,
        itemLabel: input.itemLabel,
        votes: [],
        createdAt: now,
        expiresAt: returnPollExpiresAt(now, input.ttlMs ?? RETURN_POLL_TTL_MS),
      };
      byId.set(id, record);
      return record;
    },

    createAskFriendPoll(input) {
      const now = input.now ?? new Date();
      const opts = input.options.slice(0, 3);
      if (opts.length < 2) {
        throw new Error("Ask-friend poll needs 2–3 outfit options");
      }
      const id = randomUUID();
      const record: AskFriendPollRecord = {
        id,
        kind: "outfit",
        userId: input.userId,
        options: opts,
        votes: [],
        plannedFor: input.plannedFor ?? null,
        winnerAppliedAt: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? ASK_FRIEND_POLL_TTL_MS)),
      };
      byId.set(id, record);
      return record;
    },

    get(id) {
      return byId.get(id) ?? null;
    },

    voteReturn(id, choice, voterKey, now = new Date()) {
      const poll = byId.get(id);
      if (!poll || poll.kind !== "return") return { error: "not_found" };
      if (isReturnPollExpired(poll.expiresAt, now)) return { error: "expired" };
      if (voterKey && poll.votes.some((v) => v.voterKey === voterKey)) {
        return { error: "already_voted" };
      }
      poll.votes.push({
        choice,
        voterKey,
        at: now.toISOString(),
      });
      return { poll, tally: tallyReturnVotes(poll.votes) };
    },

    voteAskFriend(id, optionId, voterKey, now = new Date()) {
      const poll = byId.get(id);
      if (!poll || poll.kind !== "outfit") return { error: "not_found" };
      if (isAskFriendPollExpired(poll.expiresAt, now)) return { error: "expired" };
      if (!poll.options.some((o) => o.id === optionId)) return { error: "bad_option" };
      if (voterKey && poll.votes.some((v) => v.voterKey === voterKey)) {
        return { error: "already_voted" };
      }
      poll.votes.push({
        optionId,
        voterKey,
        at: now.toISOString(),
      });
      return { poll, tally: tallyAskFriendVotes(poll.options, poll.votes) };
    },

    markWinnerApplied(id, now = new Date()) {
      const poll = byId.get(id);
      if (!poll || poll.kind !== "outfit") return null;
      poll.winnerAppliedAt = now;
      return poll;
    },

    clear() {
      byId.clear();
    },
  };
}

export function askFriendWinnerForCalendar(
  poll: AskFriendPollRecord,
  now: Date = new Date(),
) {
  return resolveAskFriendWinner(poll.options, poll.votes, poll.expiresAt, now);
}

/** Process-wide default store (tests call clear()). */
export const socialPollStore = createSocialPollStore();
