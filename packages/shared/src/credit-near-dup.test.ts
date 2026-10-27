import { describe, expect, it } from "vitest";
import {
  findNearDuplicateCredits,
  nearDuplicateWarnCopy,
} from "./credit-near-dup.js";

describe("credit-near-dup (U014)", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("finds same merchant + amount within ±1d", () => {
    const hits = findNearDuplicateCredits(
      [
        {
          id: "a",
          merchant: "Myntra",
          balanceCacheMinor: 50000,
          createdAt: "2026-08-27T10:00:00.000Z",
        },
        {
          id: "b",
          merchant: "Myntra",
          balanceCacheMinor: 50000,
          createdAt: "2026-08-20T10:00:00.000Z",
        },
        {
          id: "c",
          merchant: "Amazon",
          balanceCacheMinor: 50000,
          createdAt: "2026-08-27T10:00:00.000Z",
        },
      ],
      { merchant: "myntra", balanceMinor: 50000, now },
    );
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });

  it("warn copy mentions merchant", () => {
    expect(nearDuplicateWarnCopy("Myntra")).toMatch(/Myntra/);
    expect(nearDuplicateWarnCopy("Myntra")).toMatch(/add anyway/i);
  });
});
