import { describe, expect, it } from "vitest";
import {
  EMI_NUDGE_LEAD_MS,
  buildEmiDontMissCard,
  computeEmiNudgeDelayMs,
  emiDaysUntilDue,
  emiDueJobId,
  emiDueWithinDays,
  nextDueSchedule,
  remainingAfterPayment,
} from "./emi.js";

describe("remainingAfterPayment", () => {
  it("decrements and floors at zero", () => {
    expect(remainingAfterPayment(10_000, 3_000)).toBe(7_000);
    expect(remainingAfterPayment(2_000, 5_000)).toBe(0);
    expect(remainingAfterPayment(5_000, 0)).toBe(5_000);
  });
});

describe("nextDueSchedule", () => {
  it("builds monthly dues until remaining is paid", () => {
    const schedule = nextDueSchedule({
      remainingMinor: 30_000,
      installmentMinor: 10_000,
      nextDueOn: "2026-09-01",
    });
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toEqual({
      index: 1,
      dueOn: "2026-09-01",
      amountMinor: 10_000,
    });
    expect(schedule[1]!.dueOn).toBe("2026-10-01");
    expect(schedule[2]!.dueOn).toBe("2026-11-01");
  });

  it("last installment can be partial", () => {
    const schedule = nextDueSchedule({
      remainingMinor: 25_000,
      installmentMinor: 10_000,
      nextDueOn: "2026-09-15",
    });
    expect(schedule).toHaveLength(3);
    expect(schedule[2]!.amountMinor).toBe(5_000);
  });

  it("empty when remaining is zero", () => {
    expect(
      nextDueSchedule({
        remainingMinor: 0,
        installmentMinor: 1000,
        nextDueOn: "2026-09-01",
      }),
    ).toEqual([]);
  });
});

describe("computeEmiNudgeDelayMs", () => {
  it("returns null when already past due", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    expect(computeEmiNudgeDelayMs("2026-09-01", EMI_NUDGE_LEAD_MS, now)).toBeNull();
  });

  it("fires ASAP inside lead window", () => {
    const now = Date.parse("2026-08-31T12:00:00Z"); // due Sep 1, lead 2d
    expect(computeEmiNudgeDelayMs("2026-09-01", EMI_NUDGE_LEAD_MS, now)).toBe(100);
  });

  it("schedules before due outside lead window", () => {
    const now = Date.parse("2026-08-01T00:00:00Z");
    const delay = computeEmiNudgeDelayMs("2026-09-01", EMI_NUDGE_LEAD_MS, now);
    expect(delay).toBeGreaterThan(20 * 86_400_000);
  });
});

describe("emiDueJobId", () => {
  it("is stable per plan+due", () => {
    expect(emiDueJobId("p1", "2026-09-01")).toBe("emi-due:p1:2026-09-01");
  });
});

describe("emi due window + Don't miss card (W030)", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("emiDueWithinDays gates ACTIVE + remaining", () => {
    expect(
      emiDueWithinDays(
        { status: "ACTIVE", remainingMinor: 10_000, nextDueOn: "2026-08-30" },
        7,
        now,
      ),
    ).toBe(true);
    expect(
      emiDueWithinDays(
        { status: "PAID", remainingMinor: 10_000, nextDueOn: "2026-08-30" },
        7,
        now,
      ),
    ).toBe(false);
    expect(emiDaysUntilDue("2026-08-26", now)).toBe(0);
  });

  it("builds Don't miss copy for overdue / today / tomorrow / N days", () => {
    expect(
      buildEmiDontMissCard({
        id: "p1",
        provider: "Simpl",
        merchant: "Myntra",
        installmentMinor: 2000,
        remainingMinor: 8000,
        nextDueOn: "2026-08-20",
        now,
      })?.headline,
    ).toContain("overdue");

    expect(
      buildEmiDontMissCard({
        id: "p1",
        provider: "Simpl",
        installmentMinor: 2000,
        remainingMinor: 8000,
        nextDueOn: "2026-08-26",
        now,
      })?.headline,
    ).toContain("due today");

    expect(
      buildEmiDontMissCard({
        id: "p1",
        provider: "Simpl",
        installmentMinor: 2000,
        remainingMinor: 8000,
        nextDueOn: "2026-08-27",
        now,
      })?.headline,
    ).toContain("due tomorrow");

    const card = buildEmiDontMissCard({
      id: "p9",
      provider: "LazyPay",
      installmentMinor: 1500,
      remainingMinor: 4500,
      nextDueOn: "2026-08-30",
      currency: "INR",
      now,
    });
    expect(card?.headline).toContain("due in 4 days");
    expect(card?.deepLink).toBe("worn://accountant?focus=emi&plan=p9");

    expect(
      buildEmiDontMissCard({
        id: "p1",
        provider: "Simpl",
        installmentMinor: 2000,
        remainingMinor: 8000,
        nextDueOn: "2026-10-01",
        now,
      }),
    ).toBeNull();
  });
});
