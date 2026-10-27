import { describe, expect, it } from "vitest";
import {
  aggregateBrandSizeMap,
  buildSizeMapTip,
  isSizeReturnReason,
  sizeDeltaForEntry,
  sizeMapTipForBrand,
} from "./size-map.js";

describe("size-map", () => {
  it("validates size return reasons", () => {
    expect(isSizeReturnReason("TOO_SMALL")).toBe(true);
    expect(isSizeReturnReason("QUALITY")).toBe(true);
    expect(isSizeReturnReason("NOPE")).toBe(false);
    expect(isSizeReturnReason(null)).toBe(false);
  });

  it("infers size delta from reason and preferred labels", () => {
    expect(sizeDeltaForEntry({ reason: "TOO_SMALL" })).toBe(1);
    expect(sizeDeltaForEntry({ reason: "TOO_BIG" })).toBe(-1);
    expect(
      sizeDeltaForEntry({ reason: "OTHER", orderedSize: "M", preferredSize: "L" }),
    ).toBe(1);
    expect(
      sizeDeltaForEntry({ reason: "OTHER", orderedSize: "L", preferredSize: "M" }),
    ).toBe(-1);
    expect(
      sizeDeltaForEntry({ reason: "OTHER", orderedSize: "M", preferredSize: "M" }),
    ).toBeNull();
    expect(sizeDeltaForEntry({ reason: "WRONG_ITEM" })).toBeNull();
  });

  it("aggregates per-brand outcomes and suggested delta", () => {
    const rows = aggregateBrandSizeMap([
      {
        returnId: "r1",
        brand: "Zara",
        reason: "TOO_SMALL",
        returnedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        returnId: "r2",
        brand: "Zara",
        reason: "TOO_SMALL",
        returnedAt: new Date("2026-08-10T00:00:00.000Z"),
      },
      {
        returnId: "r3",
        merchant: "H&M",
        reason: "TOO_BIG",
        orderedSize: "L",
        preferredSize: "M",
        returnedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        returnId: "r4",
        reason: "QUALITY",
        returnedAt: "2026-08-05T00:00:00.000Z",
      },
      {
        returnId: "skip",
        reason: "not-a-reason",
        returnedAt: "2026-08-05T00:00:00.000Z",
      },
      {
        returnId: "r5",
        brand: "Mixed",
        reason: "TOO_SMALL",
        returnedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        returnId: "r6",
        brand: "Mixed",
        reason: "TOO_BIG",
        returnedAt: "2026-08-02T00:00:00.000Z",
      },
      // Prefer-size-only OTHER: keptOrOther + delta, no tooSmall/tooBig
      {
        returnId: "r7",
        brand: "Uniqlo",
        reason: "OTHER",
        orderedSize: "S",
        preferredSize: "M",
        returnedAt: "2026-08-03T00:00:00.000Z",
      },
      {
        returnId: "r8",
        brand: "Uniqlo",
        reason: "OTHER",
        orderedSize: "L",
        preferredSize: "M",
        returnedAt: "2026-08-04T00:00:00.000Z",
      },
    ]);

    const zara = rows.find((r) => r.brand === "Zara");
    expect(zara?.suggestedDelta).toBe(1);
    expect(zara?.outcomes.tooSmall).toBe(2);
    expect(rows.find((r) => r.brand === "H&M")?.suggestedDelta).toBe(-1);
    expect(rows.find((r) => r.brand === "Unknown")?.outcomes.keptOrOther).toBe(1);
    expect(rows.find((r) => r.brand === "Unknown")?.suggestedDelta).toBeNull();
    expect(rows.find((r) => r.brand === "Mixed")?.suggestedDelta).toBe(0);
    // Uniqlo: deltas cancel → suggestedDelta 0 via sum path
    expect(rows.find((r) => r.brand === "Uniqlo")?.suggestedDelta).toBe(0);
  });

  it("builds dismissible buy-this-size tip (W036)", () => {
    const tip = buildSizeMapTip({
      brand: "Zara",
      suggestedDelta: 1,
      sampleCount: 2,
      orderedSize: "M",
      preferredSize: "L",
    });
    expect(tip?.headline).toMatch(/Buy L next/i);
    expect(tip?.dismissKey).toBe("size-map-tip:zara");
    expect(tip?.body).toMatch(/1 return|2 returns/);

    expect(buildSizeMapTip({ brand: "X", suggestedDelta: 1, sampleCount: 0 })).toBeNull();
    expect(
      buildSizeMapTip({ brand: "  ", suggestedDelta: 0, sampleCount: 1 }),
    ).toBeNull();

    const singularPreferred = buildSizeMapTip({
      brand: "Nike",
      suggestedDelta: 1,
      sampleCount: 1,
      preferredSize: "M",
    });
    expect(singularPreferred?.body).toMatch(/1 return/);

    const sizeUp = buildSizeMapTip({
      brand: "H&M",
      suggestedDelta: 1,
      sampleCount: 1,
      orderedSize: "M",
    });
    expect(sizeUp?.headline).toMatch(/runs small/i);
    expect(sizeUp?.suggestedSize).toBe("L");
    expect(sizeUp?.body).toMatch(/try L/);

    const sizeUpBare = buildSizeMapTip({
      brand: "H&M",
      suggestedDelta: 1,
      sampleCount: 2,
    });
    expect(sizeUpBare?.body).toMatch(/Size up next/);
    expect(sizeUpBare?.body).toMatch(/2 fit returns/);

    const sizeUpNoLadder = buildSizeMapTip({
      brand: "H&M",
      suggestedDelta: 1,
      sampleCount: 1,
      orderedSize: "42",
    });
    expect(sizeUpNoLadder?.body).toMatch(/from 42/);

    // Ladder edges: cannot step past ends
    expect(
      buildSizeMapTip({
        brand: "Edge",
        suggestedDelta: 1,
        sampleCount: 1,
        orderedSize: "4XL",
      })?.suggestedSize,
    ).toBeNull();
    expect(
      buildSizeMapTip({
        brand: "Edge",
        suggestedDelta: -1,
        sampleCount: 1,
        orderedSize: "XXS",
      })?.suggestedSize,
    ).toBeNull();

    const sizeDown = buildSizeMapTip({
      brand: "Mango",
      suggestedDelta: -1,
      sampleCount: 3,
      orderedSize: "L",
    });
    expect(sizeDown?.headline).toMatch(/runs large/i);
    expect(sizeDown?.suggestedSize).toBe("M");

    const sizeDownBare = buildSizeMapTip({
      brand: "Mango",
      suggestedDelta: -1,
      sampleCount: 2,
    });
    expect(sizeDownBare?.body).toMatch(/Size down next/);

    const brands = aggregateBrandSizeMap([
      {
        returnId: "r1",
        brand: "Zara",
        reason: "TOO_SMALL",
        orderedSize: "M",
        returnedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        returnId: "r2",
        brand: "Zara Studio",
        reason: "TOO_BIG",
        orderedSize: "L",
        preferredSize: "M",
        returnedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        returnId: "r9",
        brand: "  ",
        merchant: null,
        reason: "WRONG_ITEM",
        returnedAt: "2026-08-06T00:00:00.000Z",
      },
    ]);
    expect(sizeMapTipForBrand(brands, "Zara")?.headline).toMatch(/runs small|Buy/i);
    expect(sizeMapTipForBrand(brands, "studio")?.brand).toMatch(/Zara Studio/i);
    expect(sizeMapTipForBrand(brands, "Nope")).toBeNull();
    expect(sizeMapTipForBrand([], "Zara")).toBeNull();
    expect(sizeMapTipForBrand(brands, null)).toBeNull();
    expect(sizeMapTipForBrand(brands, "   ")).toBeNull();
    expect(
      sizeMapTipForBrand(brands, "Zara", { orderedSize: "S", preferredSize: "M" })?.suggestedSize,
    ).toBe("M");
    expect(brands.find((r) => r.brand === "Unknown")?.outcomes.keptOrOther).toBe(1);
  });

  it("sizeDelta ignores non-ladder preferred labels", () => {
    expect(
      sizeDeltaForEntry({
        reason: "OTHER",
        orderedSize: "M",
        preferredSize: "42",
      }),
    ).toBeNull();
    expect(
      sizeDeltaForEntry({
        reason: "QUALITY",
        orderedSize: "  ",
        preferredSize: "L",
      }),
    ).toBeNull();
  });

  it("gates tip on SIZE_* fit reasons only (U016)", () => {
    const brands = [
      {
        brand: "Zara",
        sampleCount: 2,
        outcomes: { tooSmall: 2, tooBig: 0, keptOrOther: 0 },
        suggestedDelta: 1 as const,
        history: [],
      },
    ];
    expect(
      sizeMapTipForBrand(brands, "Zara", { reason: "QUALITY", orderedSize: "M" }),
    ).toBeNull();
    expect(
      sizeMapTipForBrand(brands, "Zara", { reason: "SIZE_TOO_SMALL", orderedSize: "M" })
        ?.headline,
    ).toMatch(/runs small/i);
    expect(isSizeReturnReason("SIZE_TOO_BIG")).toBe(true);
  });
});
