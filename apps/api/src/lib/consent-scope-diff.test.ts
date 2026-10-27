import { describe, expect, it } from "vitest";
import { computeLastSyncScopeDiff } from "./consent-scope-diff.js";

describe("U044 consent-scope-diff", () => {
  it("returns scope chips + counts for last sync without bodies", () => {
    const syncAt = new Date("2026-08-26T10:00:00.000Z");
    const diff = computeLastSyncScopeDiff({
      sources: [{ kind: "EMAIL", lastSyncAt: syncAt }],
      documents: [
        { kind: "EMAIL", createdAt: new Date("2026-08-26T11:00:00.000Z") },
        { kind: "EMAIL", createdAt: new Date("2026-08-26T12:00:00.000Z") },
        { kind: "SMS", createdAt: new Date("2026-08-26T11:30:00.000Z") },
        { kind: "EMAIL", createdAt: new Date("2026-08-20T00:00:00.000Z") },
      ],
      activeScopes: ["EMAIL", "SMS", "FINANCIAL"],
    });
    expect(diff.lastSyncAt).toBe(syncAt.toISOString());
    expect(diff.totalDocs).toBe(3);
    const email = diff.scopes.find((s) => s.scope === "EMAIL");
    const sms = diff.scopes.find((s) => s.scope === "SMS");
    expect(email?.docCount).toBe(2);
    expect(email?.used).toBe(true);
    expect(sms?.docCount).toBe(1);
    expect(diff.note).toMatch(/no message bodies/i);
    expect(JSON.stringify(diff)).not.toMatch(/body|html/i);
  });
});
