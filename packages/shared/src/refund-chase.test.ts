import { describe, expect, it } from "vitest";
import {
  needsRefundChase,
  REFUND_CHASE_STEPS,
  refundChaseSnoozeUntil,
} from "./refund-chase.js";

describe("U020 refund chase nudge", () => {
  const now = new Date("2026-08-20T12:00:00.000Z");

  it("exposes portal / chat / bank chase steps", () => {
    expect(REFUND_CHASE_STEPS.map((s) => s.id)).toEqual(["PORTAL", "CHAT", "BANK"]);
  });

  it("needs chase when past ETA and not ledger-credited", () => {
    expect(
      needsRefundChase({
        etaAt: "2026-08-19T12:00:00.000Z",
        ledgerCredited: false,
        now,
      }),
    ).toBe(true);
  });

  it("skips when credited, before ETA, or snoozed", () => {
    expect(
      needsRefundChase({
        etaAt: "2026-08-19T12:00:00.000Z",
        ledgerCredited: true,
        now,
      }),
    ).toBe(false);
    expect(
      needsRefundChase({
        etaAt: "2026-08-21T12:00:00.000Z",
        ledgerCredited: false,
        now,
      }),
    ).toBe(false);
    expect(
      needsRefundChase({
        etaAt: "2026-08-19T12:00:00.000Z",
        ledgerCredited: false,
        chaseSnoozeUntil: "2026-08-22T12:00:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("snoozes three days by default", () => {
    expect(refundChaseSnoozeUntil(now).toISOString()).toBe("2026-08-23T12:00:00.000Z");
  });
});
