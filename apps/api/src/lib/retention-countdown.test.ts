import { describe, expect, it } from "vitest";
import {
  computeRetentionCountdown,
  listRetentionCountdowns,
} from "./retention-countdown.js";

describe("U045 retention-countdown", () => {
  it("computes per-doc countdown and lists raw-present docs", () => {
    const created = new Date("2026-08-20T00:00:00.000Z");
    const now = new Date("2026-08-24T00:00:00.000Z");
    const c = computeRetentionCountdown(
      {
        id: "d1",
        kind: "EMAIL",
        createdAt: created,
        rawKey: "raw/k1",
        matchedPurchaseId: "p1",
      },
      now,
    );
    expect(c?.retentionDays).toBe(7);
    expect(c?.daysRemaining).toBe(3);
    expect(c?.rawPresent).toBe(true);
    expect(c?.matchedPurchaseId).toBe("p1");

    const list = listRetentionCountdowns(
      [
        {
          id: "d1",
          kind: "EMAIL",
          createdAt: created,
          rawKey: "raw/k1",
        },
        {
          id: "d2",
          kind: "EMAIL",
          createdAt: created,
          rawKey: "",
        },
      ],
      now,
    );
    expect(list).toHaveLength(1);
  });
});
