import { describe, expect, it } from "vitest";
import { routeBrokenItem } from "./warrantyVsReturn.js";

describe("U028 warranty vs return router", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("prefers open return window as primary CTA", () => {
    const result = routeBrokenItem({
      now,
      returnWindowDeadline: "2026-09-01T00:00:00.000Z",
      warrantyCoverageUntil: "2027-01-01T00:00:00.000Z",
      warrantyState: "ACTIVE",
      itemTitle: "Blazer",
    });
    expect(result.path).toBe("RETURN");
    expect(result.primary.kind).toBe("INITIATE_RETURN");
    expect(result.reason).toMatch(/Return window is still open/i);
    expect(result.secondaryHint).toMatch(/Warranty stays available/i);
  });

  it("routes to warranty when return closed but coverage active", () => {
    const result = routeBrokenItem({
      now,
      returnWindowDeadline: "2026-08-01T00:00:00.000Z",
      warrantyCoverageUntil: "2027-01-01T00:00:00.000Z",
      warrantyState: "ACTIVE",
      itemTitle: "Watch",
    });
    expect(result.path).toBe("WARRANTY");
    expect(result.primary.kind).toBe("CLAIM_WARRANTY");
    expect(result.reason).toMatch(/warranty coverage is still active/i);
  });

  it("returns NEITHER when both closed", () => {
    const result = routeBrokenItem({
      now,
      returnWindowDeadline: "2026-01-01T00:00:00.000Z",
      warrantyCoverageUntil: "2026-02-01T00:00:00.000Z",
      warrantyState: "ACTIVE",
    });
    expect(result.path).toBe("NEITHER");
    expect(result.primary.kind).toBe("NONE");
  });

  it("ignores claimed warranty for claim path", () => {
    const result = routeBrokenItem({
      now,
      returnWindowDeadline: "2026-01-01T00:00:00.000Z",
      warrantyCoverageUntil: "2027-01-01T00:00:00.000Z",
      warrantyState: "CLAIMED",
    });
    expect(result.path).toBe("NEITHER");
  });
});
