import { describe, expect, it } from "vitest";
import {
  applyDryCleanCancel,
  applyDryCleanConfirm,
  applyDryCleanDropOff,
  dryCleanPhase,
  isValidDryCleanTransition,
} from "./dry-clean.js";

describe("dry-clean state machine", () => {
  it("starts IDLE without ticket", () => {
    expect(dryCleanPhase({ laundryStatus: "CLEAN" })).toBe("IDLE");
    expect(dryCleanPhase({ laundryStatus: "DIRTY", dryCleanTicket: null })).toBe("IDLE");
  });

  it("drop-off sets IN_LAUNDRY + ticket + pickup", () => {
    const result = applyDryCleanDropOff(
      { laundryStatus: "DIRTY" },
      { ticket: "DC-9988", pickupOn: "2026-08-28" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toBe("IDLE");
    expect(result.to).toBe("AT_CLEANER");
    expect(result.patch).toEqual({
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: "DC-9988",
      dryCleanPickupOn: "2026-08-28",
    });
    expect(
      dryCleanPhase({
        laundryStatus: result.patch.laundryStatus,
        dryCleanTicket: result.patch.dryCleanTicket,
        dryCleanPickupOn: result.patch.dryCleanPickupOn,
      }),
    ).toBe("AT_CLEANER");
  });

  it("confirm pickup → CLEAN and clears ticket", () => {
    const result = applyDryCleanConfirm({
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: "DC-1",
      dryCleanPickupOn: "2026-08-28",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.to).toBe("RETURNED");
    expect(result.patch.laundryStatus).toBe("CLEAN");
    expect(result.patch.dryCleanTicket).toBeNull();
    expect(result.patch.dryCleanPickupOn).toBeNull();
  });

  it("rejects confirm when not at cleaner", () => {
    const result = applyDryCleanConfirm({ laundryStatus: "CLEAN" });
    expect(result.ok).toBe(false);
  });

  it("cancel returns DIRTY and clears ticket", () => {
    const result = applyDryCleanCancel({
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: "X",
      dryCleanPickupOn: "2026-08-29",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.laundryStatus).toBe("DIRTY");
    expect(result.patch.dryCleanTicket).toBeNull();
  });

  it("validates transition graph", () => {
    expect(isValidDryCleanTransition("IDLE", "AT_CLEANER")).toBe(true);
    expect(isValidDryCleanTransition("AT_CLEANER", "RETURNED")).toBe(true);
    expect(isValidDryCleanTransition("IDLE", "RETURNED")).toBe(false);
  });

  it("rejects empty ticket / bad date", () => {
    expect(applyDryCleanDropOff({}, { ticket: "  ", pickupOn: "2026-08-28" }).ok).toBe(false);
    expect(applyDryCleanDropOff({}, { ticket: "T1", pickupOn: "28-08-2026" }).ok).toBe(false);
  });
});
