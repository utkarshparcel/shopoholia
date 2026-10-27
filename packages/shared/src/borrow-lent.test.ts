import { describe, expect, it } from "vitest";
import {
  applyLend,
  applyLendReturn,
  filterLentDue,
  isLentOut,
  isLentOverdue,
  sortLentByDueAsc,
} from "./borrow-lent.js";

describe("borrow-lent", () => {
  it("detects lent-out and overdue", () => {
    expect(isLentOut({ lentTo: "  " })).toBe(false);
    expect(isLentOut({ lentTo: "Priya" })).toBe(true);
    expect(isLentOverdue({ lentTo: "Priya", lentDueOn: "2026-08-01" }, "2026-08-26")).toBe(true);
    expect(isLentOverdue({ lentTo: "Priya", lentDueOn: "2026-09-01" }, "2026-08-26")).toBe(false);
    expect(isLentOverdue({ lentTo: null, lentDueOn: "2026-08-01" }, "2026-08-26")).toBe(false);
    expect(isLentOverdue({ lentTo: "Priya", lentDueOn: "soon" }, "2026-08-26")).toBe(false);
  });

  it("applyLend validates and patches", () => {
    expect(applyLend({}, { lentTo: "  ", dueOn: "2026-09-01" })).toEqual({
      ok: false,
      error: "lentTo required",
    });
    expect(applyLend({}, { lentTo: "Sam", dueOn: "09-01" })).toEqual({
      ok: false,
      error: "dueOn must be YYYY-MM-DD",
    });
    expect(applyLend({}, { lentTo: " Sam ", dueOn: "2026-09-01" })).toEqual({
      ok: true,
      patch: { lentTo: "Sam", lentDueOn: "2026-09-01" },
    });
  });

  it("applyLendReturn clears only when lent", () => {
    expect(applyLendReturn({})).toEqual({ ok: false, error: "item is not lent out" });
    expect(applyLendReturn({ lentTo: "Sam", lentDueOn: "2026-09-01" })).toEqual({
      ok: true,
      patch: { lentTo: null, lentDueOn: null },
    });
  });

  it("filterLentDue supports all / due / overdue", () => {
    const items = [
      { id: "1", lentTo: "A", lentDueOn: "2026-08-01" },
      { id: "2", lentTo: "B", lentDueOn: "2026-08-26" },
      { id: "3", lentTo: "C", lentDueOn: "2026-09-01" },
      { id: "4", lentTo: null, lentDueOn: "2026-08-01" },
      { id: "5", lentTo: "D", lentDueOn: "bad" },
    ];
    expect(filterLentDue(items, { asOf: "2026-08-26" }).map((i) => i.id)).toEqual([
      "1",
      "2",
      "3",
      "5",
    ]);
    expect(filterLentDue(items, { asOf: "2026-08-26", filter: "due" }).map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);
    expect(
      filterLentDue(items, { asOf: "2026-08-26", filter: "overdue" }).map((i) => i.id),
    ).toEqual(["1"]);
    expect(filterLentDue(items, { asOf: "nope", filter: "due" })).toEqual([]);
  });

  it("sortLentByDueAsc puts nulls last", () => {
    const sorted = sortLentByDueAsc([
      { id: "b", lentDueOn: "2026-09-01" },
      { id: "a", lentDueOn: "2026-08-01" },
      { id: "n", lentDueOn: null },
      { id: "e", lentDueOn: "" },
      { id: "same1", lentDueOn: "2026-08-15" },
      { id: "same2", lentDueOn: "2026-08-15" },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "same1", "same2", "b", "n", "e"]);
  });
});
