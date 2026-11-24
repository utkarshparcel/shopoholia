import { describe, expect, it } from "vitest";
import {
  affiliateSuggestionUrl,
  detectMissingPieces,
} from "./missing-piece.js";

describe("N31 missing-piece gap heuristic", () => {
  it("flags bottoms gap when many tops lack trousers", () => {
    const report = detectMissingPieces([
      { id: "1", category: "white shirt", colors: ["white"] },
      { id: "2", category: "navy tee", colors: ["navy"] },
      { id: "3", category: "striped blouse", colors: ["blue"] },
      { id: "4", category: "linen shirt", colors: ["beige"] },
      { id: "5", category: "sneakers", colors: ["white"] },
    ]);
    expect(report.gaps.length).toBeGreaterThan(0);
    const bottoms = report.gaps.find((g) => g.missingSlot === "bottom");
    expect(bottoms).toBeTruthy();
    expect(bottoms!.unlockedByCount).toBeGreaterThanOrEqual(4);
    expect(bottoms!.affiliateUrl).toContain("myntra.com");
    expect(report.summary.toLowerCase()).toMatch(/gap/);
  });

  it("suggests color-matched trousers for tops sharing a color", () => {
    const report = detectMissingPieces([
      { id: "1", category: "black blouse", colors: ["black"] },
      { id: "2", category: "black tee", colors: ["black"] },
      { id: "3", category: "black tank", colors: ["black"] },
      { id: "4", category: "black camisole", colors: ["black"] },
      { id: "5", category: "blue jeans", colors: ["blue"] },
    ]);
    const blackGap = report.gaps.find((g) => /black trousers/i.test(g.suggestion) || /black trousers/i.test(g.message));
    expect(blackGap).toBeTruthy();
    expect(blackGap!.message).toMatch(/4 tops|Need black/i);
  });

  it("builds affiliate shopping URLs", () => {
    expect(affiliateSuggestionUrl("black trousers")).toContain("myntra");
    expect(affiliateSuggestionUrl("white sneakers", "amazon")).toContain("amazon.in");
    expect(affiliateSuggestionUrl("belt", "flipkart")).toContain("flipkart");
  });

  it("tags shopping URLs only with configured affiliate ids", () => {
    const none = {};
    expect(affiliateSuggestionUrl("black trousers", "myntra", none)).toBe(
      "https://www.myntra.com/black-trousers",
    );
    expect(affiliateSuggestionUrl("belt", "flipkart", none)).toBe("https://www.flipkart.com/search?q=belt");
    expect(affiliateSuggestionUrl("belt", "amazon", none)).not.toMatch(/tag=/);
    expect(affiliateSuggestionUrl("belt", "amazon", { amazon: "worn-21" })).toBe(
      "https://www.amazon.in/s?k=belt&tag=worn-21",
    );
    expect(affiliateSuggestionUrl("belt", "flipkart", { flipkart: "wornfk" })).toBe(
      "https://www.flipkart.com/search?q=belt&affid=wornfk",
    );
  });
});
