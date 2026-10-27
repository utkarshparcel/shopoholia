import { describe, expect, it } from "vitest";
import {
  buildNeverWornShareCard,
  formatNeverWornAmount,
  redactBrandLabel,
  redactCardDigits,
  wearChallengeCelebrateCopy,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
  WEAR_CHALLENGE_TARGET,
  WASTE_SHARE_WATERMARK,
} from "./waste.js";

describe("redact helpers", () => {
  it("blurs brand labels", () => {
    expect(redactBrandLabel("Myntra")).toBe("M••••a");
    expect(redactBrandLabel("AB")).toBe("••");
    expect(redactBrandLabel("")).toBe("••••");
    expect(redactBrandLabel(null)).toBe("••••");
  });

  it("strips card-like digit runs", () => {
    expect(redactCardDigits("Myntra 4111 1111 1111 1111")).toContain("••••");
    expect(redactCardDigits("Myntra 4111 1111 1111 1111")).not.toMatch(/4111/);
    expect(redactBrandLabel("Card 5555-5555-5555-4444")).not.toMatch(/\d{4}/);
  });
});

describe("never-worn share card", () => {
  it("formats amount with currency", () => {
    expect(formatNeverWornAmount(40_000_00, "INR")).toContain("₹");
    expect(formatNeverWornAmount(12_345, "USD")).toContain("$");
  });

  it("builds share payload with blurred merchants + watermark", () => {
    const card = buildNeverWornShareCard({
      neverWornCostMinor: 40_000_00,
      itemCount: 3,
      brands: ["Myntra", "Myntra", "Zara", null],
      currency: "INR",
    });
    expect(card.headline).toMatch(/never worn/);
    expect(card.amountLabel).toContain("₹");
    expect(card.blurredMerchants).toEqual(["M••••a", "Z•••"]);
    expect(card.watermark).toBe(WASTE_SHARE_WATERMARK);
    expect(card.shareText).toContain(WASTE_SHARE_WATERMARK);
    expect(card.shareText).not.toMatch(/Myntra|Zara/);
    expect(card.shareText).not.toMatch(/\d{4}[\s-]?\d{4}/);
  });

  it("handles zero never-worn", () => {
    const card = buildNeverWornShareCard({ neverWornCostMinor: 0, itemCount: 0 });
    expect(card.headline).toBe("Closet waste check");
    expect(card.shareText).toContain(WASTE_SHARE_WATERMARK);
  });
});

describe("wear challenge progress", () => {
  it("counts 0/3 → 3/3 and celebrates", () => {
    expect(wearChallengeProgress(0, "DEAD")).toMatchObject({
      eligible: true,
      progress: 0,
      target: WEAR_CHALLENGE_TARGET,
      remaining: 3,
      completed: false,
      label: "0/3 wears",
    });
    expect(wearChallengeProgress(1, "DEAD")).toMatchObject({
      progress: 1,
      remaining: 2,
      label: "1/3 wears",
    });
    expect(wearChallengeProgress(3, "ACTIVE")).toMatchObject({
      eligible: false,
      progress: 3,
      remaining: 0,
      completed: true,
      label: "Challenge done — worn 3×",
    });
  });

  it("stays eligible after start even when status flips ACTIVE", () => {
    expect(wearChallengeProgress(1, "ACTIVE", { started: true })).toMatchObject({
      eligible: true,
      progress: 1,
      completed: false,
    });
  });

  it("keeps in-progress items eligible without explicit started flag", () => {
    expect(wearChallengeProgress(2, "ACTIVE")).toMatchObject({
      eligible: true,
      progress: 2,
      remaining: 1,
    });
  });

  it("nudge + celebrate copy", () => {
    expect(wearChallengeNudgeCopy(wearChallengeProgress(0, "DORMANT"), "navy shirt")).toMatch(
      /Wear navy shirt 3×/,
    );
    expect(wearChallengeNudgeCopy(wearChallengeProgress(0, "DORMANT"))).toMatch(
      /Wear it 3×/,
    );
    expect(wearChallengeNudgeCopy(wearChallengeProgress(2, "ACTIVE", { started: true }))).toBe(
      "2/3 wears — 1 to go.",
    );
    expect(
      wearChallengeNudgeCopy(wearChallengeProgress(3, "ACTIVE", { started: true }), "kurta"),
    ).toMatch(/kurta/);
    expect(wearChallengeCelebrateCopy("navy shirt")).toMatch(/navy shirt/);
    expect(wearChallengeCelebrateCopy(null)).toMatch(/that piece/);
  });
});
