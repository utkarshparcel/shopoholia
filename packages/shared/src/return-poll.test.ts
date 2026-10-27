import { describe, expect, it } from "vitest";
import {
  RETURN_POLL_TTL_MS,
  buildReturnPollShare,
  isReturnPollExpired,
  returnPollExpiresAt,
  tallyReturnVotes,
} from "./return-poll.js";

describe("return poll expiry (N35)", () => {
  it("expires at/after deadline", () => {
    const created = new Date("2026-08-26T10:00:00.000Z");
    const expires = returnPollExpiresAt(created);
    expect(expires.getTime() - created.getTime()).toBe(RETURN_POLL_TTL_MS);
    expect(isReturnPollExpired(expires, new Date("2026-08-26T11:00:00.000Z"))).toBe(false);
    expect(isReturnPollExpired(expires, expires)).toBe(true);
    expect(
      isReturnPollExpired(expires.toISOString(), new Date("2026-08-28T10:00:01.000Z")),
    ).toBe(true);
  });

  it("treats invalid expiresAt as expired", () => {
    expect(isReturnPollExpired("not-a-date")).toBe(true);
  });
});

describe("tallyReturnVotes", () => {
  it("returns KEEP / RETURN / tie", () => {
    expect(
      tallyReturnVotes([
        { choice: "KEEP" },
        { choice: "KEEP" },
        { choice: "RETURN" },
      ]),
    ).toEqual({ keep: 2, return: 1, total: 3, winner: "KEEP" });
    expect(
      tallyReturnVotes([{ choice: "RETURN" }, { choice: "RETURN" }]),
    ).toEqual({ keep: 0, return: 2, total: 2, winner: "RETURN" });
    expect(
      tallyReturnVotes([{ choice: "KEEP" }, { choice: "RETURN" }]),
    ).toEqual({ keep: 1, return: 1, total: 2, winner: null });
  });
});

describe("buildReturnPollShare", () => {
  it("builds keep/return deep link share", () => {
    const card = buildReturnPollShare({
      pollId: "poll-1",
      itemLabel: "blue shirt",
    });
    expect(card.deepLink).toBe("https://worn.app/p/return/poll-1");
    expect(card.shareText).toMatch(/Should I return blue shirt/);
    expect(card.shareText).toContain(card.deepLink);
  });
});
