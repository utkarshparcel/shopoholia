import { describe, expect, it } from "vitest";
import {
  normalizeRepairDate,
  sumRepairSpend,
  validateCreateRepairLog,
} from "./repair-log.js";

describe("repair-log", () => {
  it("normalizes YYYY-MM-DD and ISO datetimes", () => {
    expect(normalizeRepairDate("2026-08-26")).toBe("2026-08-26");
    expect(normalizeRepairDate(" 2026-08-26T15:30:00.000Z ")).toBe("2026-08-26");
    expect(normalizeRepairDate("not-a-date")).toBeNull();
  });

  it("validateCreateRepairLog accepts and rejects", () => {
    expect(validateCreateRepairLog({ costMinor: -1, repairedOn: "2026-08-01" })).toEqual({
      ok: false,
      error: "costMinor must be a non-negative integer",
    });
    expect(validateCreateRepairLog({ costMinor: 1.5, repairedOn: "2026-08-01" })).toEqual({
      ok: false,
      error: "costMinor must be a non-negative integer",
    });
    expect(validateCreateRepairLog({ costMinor: 100, repairedOn: "nope" })).toEqual({
      ok: false,
      error: "repairedOn must be YYYY-MM-DD or ISO datetime",
    });
    expect(
      validateCreateRepairLog({
        costMinor: 100,
        repairedOn: "2026-08-01",
        kind: "NOT_A_KIND" as "REPAIR",
      }),
    ).toEqual({ ok: false, error: "invalid repair kind" });

    expect(
      validateCreateRepairLog({
        costMinor: 25000,
        repairedOn: "2026-08-01T10:00:00.000Z",
        kind: "HEM",
        note: "  hem jeans  ",
        tailorOrderId: "t1",
      }),
    ).toEqual({
      ok: true,
      costMinor: 25000,
      repairedOn: "2026-08-01",
      kind: "HEM",
      note: "hem jeans",
      tailorOrderId: "t1",
    });

    expect(
      validateCreateRepairLog({
        costMinor: 0,
        repairedOn: "2026-08-01",
        note: "   ",
      }),
    ).toMatchObject({ ok: true, kind: "REPAIR", note: null, tailorOrderId: null });
  });

  it("sumRepairSpend totals lifetime + current month", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const monthStart = new Date(Date.UTC(2026, 7, 1));
    const result = sumRepairSpend(
      [
        { costMinor: 1000, repairedOn: "2026-07-15" },
        { costMinor: 2000, repairedOn: "2026-08-10" },
        { costMinor: -5, repairedOn: "2026-08-11" },
        { costMinor: 500, repairedOn: "bad-date" },
      ],
      { now, monthStart },
    );
    expect(result.totalMinor).toBe(3500);
    expect(result.monthlyMinor).toBe(2000);
  });
});
