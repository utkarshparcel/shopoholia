import { describe, expect, it } from "vitest";
import {
  EMI_NUDGE_LEAD_MS,
  buildEmiDontMissCard,
  computeEmiNudgeDelayMs,
  emiDaysUntilDue,
  emiDueJobId,
  emiDueWithinDays,
  addEmiMonths,
  emiDueDayOf,
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

  it("keeps a 31st plan on month ends instead of drifting", () => {
    const dues = nextDueSchedule({
      remainingMinor: 60_000,
      installmentMinor: 10_000,
      nextDueOn: "2027-01-31",
    }).map((i) => i.dueOn);
    expect(dues).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"]);
  });

  it("goes back to the plan's due day after a clamped month", () => {
    const dues = nextDueSchedule({
      remainingMinor: 30_000,
      installmentMinor: 10_000,
      nextDueOn: "2028-02-29",
      dueDay: 31,
    }).map((i) => i.dueOn);
    expect(dues).toEqual(["2028-02-29", "2028-03-31", "2028-04-30"]);
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

describe("addEmiMonths", () => {
  it("clamps to the last day of shorter months, then returns to the due day", () => {
    expect(addEmiMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addEmiMonths("2027-02-28", 1, 31)).toBe("2027-03-31");
    expect(addEmiMonths("2027-03-31", 1, 31)).toBe("2027-04-30");
    expect(addEmiMonths("2027-04-30", 1, 31)).toBe("2027-05-31");
    expect(addEmiMonths("2027-01-30", 1)).toBe("2027-02-28");
    expect(addEmiMonths("2027-02-28", 1, 30)).toBe("2027-03-30");
  });

  it("uses Feb 29 in leap years", () => {
    expect(addEmiMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addEmiMonths("2028-01-29", 1)).toBe("2028-02-29");
    expect(addEmiMonths("2027-01-29", 1)).toBe("2027-02-28");
    expect(addEmiMonths("2100-01-31", 1)).toBe("2100-02-28");
    expect(addEmiMonths("2000-01-31", 1)).toBe("2000-02-29");
  });

  it("crosses year ends and moves several months at once", () => {
    expect(addEmiMonths("2026-12-31", 1)).toBe("2027-01-31");
    expect(addEmiMonths("2026-11-30", 3, 31)).toBe("2027-02-28");
    expect(addEmiMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addEmiMonths("2026-09-15", 1)).toBe("2026-10-15");
  });

  it("walking a 31st plan month by month never drifts", () => {
    let due = "2027-01-31";
    const dueDay = emiDueDayOf(due);
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      due = addEmiMonths(due, 1, dueDay);
      seen.push(due);
    }
    expect(seen).toEqual([
      "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30", "2027-07-31",
      "2027-08-31", "2027-09-30", "2027-10-31", "2027-11-30", "2027-12-31", "2028-01-31",
    ]);
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
