import { describe, expect, it } from "vitest";
import {
  DECLUTTER_CHALLENGE_TARGET,
  DECLUTTER_SHARE_WATERMARK,
  buildDeclutterShareCard,
  countDisposedItems,
  declutterChallengeCelebrateCopy,
  declutterChallengeNudgeCopy,
  declutterChallengeProgress,
} from "./declutter.js";

describe("countDisposedItems", () => {
  it("counts unique wardrobe items; skips cancelled", () => {
    expect(
      countDisposedItems([
        { wardrobeItemId: "a", status: "ACTIVE", mode: "SELL" },
        { wardrobeItemId: "a", status: "SOLD", mode: "SELL" },
        { wardrobeItemId: "b", status: "DONATED", mode: "DONATE" },
        { wardrobeItemId: "c", status: "CANCELLED", mode: "SELL" },
        { wardrobeItemId: "d", status: "BARTERED", mode: "BARTER" },
      ]),
    ).toBe(3);
  });

  it("treats missing status as ACTIVE", () => {
    expect(countDisposedItems([{ wardrobeItemId: "x" }])).toBe(1);
  });
});

describe("declutterChallengeProgress", () => {
  it("tracks 0/N → N/N", () => {
    expect(declutterChallengeProgress(0)).toMatchObject({
      eligible: true,
      started: false,
      progress: 0,
      target: DECLUTTER_CHALLENGE_TARGET,
      remaining: DECLUTTER_CHALLENGE_TARGET,
      completed: false,
      label: `0/${DECLUTTER_CHALLENGE_TARGET} cleared`,
    });
    expect(declutterChallengeProgress(2, { started: true })).toMatchObject({
      progress: 2,
      remaining: DECLUTTER_CHALLENGE_TARGET - 2,
      started: true,
      completed: false,
      label: `2/${DECLUTTER_CHALLENGE_TARGET} cleared`,
    });
    expect(declutterChallengeProgress(5, { started: true })).toMatchObject({
      eligible: false,
      progress: 5,
      remaining: 0,
      completed: true,
      label: "Challenge done — cleared 5",
    });
  });

  it("respects custom target", () => {
    expect(declutterChallengeProgress(1, { target: 3, started: true })).toMatchObject({
      progress: 1,
      target: 3,
      remaining: 2,
    });
  });

  it("nudge + celebrate copy", () => {
    expect(declutterChallengeNudgeCopy(declutterChallengeProgress(0))).toMatch(/Clear 5 pieces/);
    expect(declutterChallengeNudgeCopy(declutterChallengeProgress(0, { started: true }))).toMatch(
      /Challenge on/,
    );
    expect(declutterChallengeNudgeCopy(declutterChallengeProgress(3, { started: true }))).toBe(
      "3/5 cleared — 2 to go.",
    );
    expect(
      declutterChallengeNudgeCopy(declutterChallengeProgress(5, { started: true })),
    ).toMatch(/cleared 5 pieces/);
    expect(declutterChallengeCelebrateCopy()).toMatch(/cleared 5 pieces/);
  });
});

describe("declutter share card", () => {
  it("builds progress share text with watermark (no brands)", () => {
    const card = buildDeclutterShareCard({
      progress: 3,
      modes: ["SELL", "SELL", "DONATE", "FOOD"],
    });
    expect(card.headline).toMatch(/3\/5 cleared/);
    expect(card.modeLine).toBe("2 sell · 1 donate");
    expect(card.watermark).toBe(DECLUTTER_SHARE_WATERMARK);
    expect(card.shareText).toContain(DECLUTTER_SHARE_WATERMARK);
    expect(card.shareText).not.toMatch(/Myntra|Zara|\d{4}/);
    expect(card.completed).toBe(false);
  });

  it("celebrates when goal met", () => {
    const card = buildDeclutterShareCard({ progress: 5, target: 5, modes: ["DONATE"] });
    expect(card.completed).toBe(true);
    expect(card.headline).toMatch(/cleared 5 pieces/);
    expect(card.shareText).toContain(DECLUTTER_SHARE_WATERMARK);
    expect(card.shareText).toMatch(/Less dead inventory/);
  });

  it("starts with zero-progress headline when not completed", () => {
    const card = buildDeclutterShareCard({ progress: 0, target: 5 });
    expect(card.headline).toMatch(/Starting a 5-piece declutter/);
    expect(card.modeLine).toBeNull();
  });
});
