import { describe, expect, it } from "vitest";
import {
  applyLend,
  applyLendReturn,
  filterLentDue,
  isLentOverdue,
  isLentOut,
  sortLentByDueAsc,
} from "@worn/shared";

describe("N25 borrow-lent due query", () => {
  const items = [
    { id: "1", lentTo: "Riya", lentDueOn: "2026-08-20" },
    { id: "2", lentTo: "Amit", lentDueOn: "2026-08-26" },
    { id: "3", lentTo: "Sara", lentDueOn: "2026-09-01" },
    { id: "4", lentTo: null, lentDueOn: null },
    { id: "5", lentTo: "  ", lentDueOn: "2026-08-01" },
  ];

  it("filters all currently lent", () => {
    const all = filterLentDue(items, { asOf: "2026-08-26", filter: "all" });
    expect(all.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("filters due on/before asOf", () => {
    const due = filterLentDue(items, { asOf: "2026-08-26", filter: "due" });
    expect(due.map((i) => i.id).sort()).toEqual(["1", "2"]);
  });

  it("filters overdue (before asOf)", () => {
    const overdue = filterLentDue(items, { asOf: "2026-08-26", filter: "overdue" });
    expect(overdue.map((i) => i.id)).toEqual(["1"]);
  });

  it("sorts by due ascending", () => {
    const sorted = sortLentByDueAsc(filterLentDue(items, { asOf: "2026-08-26", filter: "all" }));
    expect(sorted.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("applyLend / return + overdue check", () => {
    const lend = applyLend({}, { lentTo: "Riya", dueOn: "2026-08-20" });
    expect(lend.ok).toBe(true);
    if (!lend.ok) return;
    expect(isLentOut(lend.patch)).toBe(true);
    expect(isLentOverdue(lend.patch, "2026-08-26")).toBe(true);
    const ret = applyLendReturn(lend.patch);
    expect(ret.ok).toBe(true);
    if (!ret.ok) return;
    expect(isLentOut(ret.patch)).toBe(false);
  });
});
