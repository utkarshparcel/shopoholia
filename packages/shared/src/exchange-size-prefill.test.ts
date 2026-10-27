import { describe, expect, it } from "vitest";
import { buildExchangeSizePrefill } from "./exchange-size-prefill.js";
import type { SizeMapBrandRow } from "./size-map.js";

describe("U021 exchange size prefill", () => {
  const brands: SizeMapBrandRow[] = [
    {
      brand: "Myntra",
      sampleCount: 2,
      outcomes: { tooSmall: 2, tooBig: 0, keptOrOther: 0 },
      suggestedDelta: 1,
      history: [
        {
          returnId: "00000000-0000-4000-8000-000000000001",
          brand: "Myntra",
          merchant: "Myntra",
          itemTitle: "Tee",
          category: "TOPS",
          orderedSize: "M",
          preferredSize: "L",
          reason: "TOO_SMALL",
          returnedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    },
  ];

  it("prefills recommended size and never auto-submits", () => {
    const prefill = buildExchangeSizePrefill({
      brands,
      merchant: "Myntra",
      orderedSize: "M",
    });
    expect(prefill.recommendedSize).toBe("L");
    expect(prefill.editable).toBe(true);
    expect(prefill.autoSubmit).toBe(false);
  });
});
