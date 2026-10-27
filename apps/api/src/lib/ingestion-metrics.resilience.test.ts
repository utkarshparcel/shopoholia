import { describe, expect, it } from "vitest";
import { computeIngestionMetrics } from "./ingestion-metrics.js";

describe("ingestion metrics resilience", () => {
  it("computes deadLetterCount from ERROR status", () => {
    const docs = [
      { status: "MATCHED", kind: "EMAIL" } as never,
      { status: "ERROR", kind: "EMAIL" } as never,
      { status: "ERROR", kind: "SMS" } as never,
    ];
    const m = computeIngestionMetrics(docs, []);
    expect(m.deadLetterCount).toBe(2);
    expect(m.errorRate).toBeGreaterThan(0);
    expect(m.note).toContain("deadLetterCount");
  });
});
