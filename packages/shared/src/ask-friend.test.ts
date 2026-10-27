import { describe, expect, it } from "vitest";
import {
  buildAskFriendShare,
  resolveAskFriendWinner,
  tallyAskFriendVotes,
} from "./ask-friend.js";

const options = [
  { id: "a", label: "Look A · navy", itemIds: ["i1", "i2"] },
  { id: "b", label: "Look B · linen", itemIds: ["i3"] },
  { id: "c", label: "Look C · black", itemIds: ["i4", "i5"] },
];

describe("tallyAskFriendVotes (N38)", () => {
  it("picks clear winner", () => {
    const tally = tallyAskFriendVotes(options, [
      { optionId: "b" },
      { optionId: "b" },
      { optionId: "a" },
    ]);
    expect(tally).toEqual({
      counts: { a: 1, b: 2, c: 0 },
      total: 3,
      winnerId: "b",
    });
  });

  it("ties and empty → null winner", () => {
    expect(
      tallyAskFriendVotes(options, [{ optionId: "a" }, { optionId: "b" }]).winnerId,
    ).toBeNull();
    expect(tallyAskFriendVotes(options, []).winnerId).toBeNull();
  });

  it("ignores unknown option ids", () => {
    const tally = tallyAskFriendVotes(options, [
      { optionId: "zzz" },
      { optionId: "a" },
      { optionId: "a" },
    ]);
    expect(tally.total).toBe(2);
    expect(tally.winnerId).toBe("a");
  });
});

describe("resolveAskFriendWinner", () => {
  it("returns option for calendar commit", () => {
    const expires = "2099-01-01T00:00:00.000Z";
    const winner = resolveAskFriendWinner(
      options,
      [{ optionId: "c" }, { optionId: "c" }],
      expires,
    );
    expect(winner?.id).toBe("c");
    expect(winner?.itemIds).toEqual(["i4", "i5"]);
  });

  it("null when expired", () => {
    expect(
      resolveAskFriendWinner(options, [{ optionId: "a" }], "2020-01-01T00:00:00.000Z"),
    ).toBeNull();
  });
});

describe("buildAskFriendShare", () => {
  it("lists 2–3 looks with deep link", () => {
    const card = buildAskFriendShare({ pollId: "p1", options });
    expect(card.deepLink).toBe("https://worn.app/p/outfit/p1");
    expect(card.shareText).toContain("A) Look A");
    expect(card.shareText).toContain("C) Look C");
    expect(card.shareText).toContain(card.deepLink);
  });
});
