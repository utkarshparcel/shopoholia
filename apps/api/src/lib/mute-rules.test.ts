import { describe, expect, it } from "vitest";
import {
  canUndoMuteRule,
  createMuteRule,
  matchesMuteRule,
  MUTE_UNDO_DAYS,
  previewMuteRule,
  removeMuteRule,
  writeMuteRulesToMeta,
} from "./mute-rules.js";

describe("U043 mute-rules", () => {
  it("previews sender/subject matches", () => {
    const docs = [
      {
        id: "1",
        kind: "EMAIL",
        parsedJson: { from: "promo@brand.com", subject: "50% OFF FLASH", merchant: "Brand" },
      },
      {
        id: "2",
        kind: "EMAIL",
        parsedJson: { from: "orders@myntra.com", subject: "Your order shipped", merchant: "Myntra" },
      },
    ];
    const preview = previewMuteRule({ type: "subject", pattern: "flash" }, docs);
    expect(preview.count).toBe(1);
    expect(preview.matches[0]?.documentId).toBe("1");
    expect(matchesMuteRule({ type: "sender", pattern: "promo@" }, docs[0]!)).toBe(true);
  });

  it("allows undo within 7d and rejects after", () => {
    expect(MUTE_UNDO_DAYS).toBe(7);
    const now = new Date("2026-08-20T00:00:00.000Z");
    const rule = createMuteRule({
      type: "merchant",
      pattern: "Zomato",
      previewCount: 3,
      now: new Date("2026-08-15T00:00:00.000Z"),
    });
    expect(canUndoMuteRule(rule, now)).toBe(true);
    const meta = writeMuteRulesToMeta({}, [rule]);
    expect((meta.muteRules as unknown[]).length).toBe(1);

    const expired = createMuteRule({
      type: "merchant",
      pattern: "Swiggy",
      previewCount: 1,
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    const removed = removeMuteRule([expired], expired.id, now);
    expect(removed.error).toBe("undo_expired");
    expect(removeMuteRule([rule], rule.id, now).removed?.id).toBe(rule.id);
  });
});
