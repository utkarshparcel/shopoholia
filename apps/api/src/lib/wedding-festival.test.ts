import { describe, expect, it } from "vitest";
import {
  dayLabelForEvent,
  eventDayCount,
  eventDayKeys,
  occasionForEventDay,
  planWeddingFestival,
} from "./wedding-festival.js";

describe("wedding-festival (N39)", () => {
  it("counts inclusive event days", () => {
    expect(eventDayCount("2026-11-06", "2026-11-06")).toBe(1);
    expect(eventDayCount("2026-11-06", "2026-11-08")).toBe(3);
    expect(eventDayCount("2026-11-08", "2026-11-06")).toBe(0);
    expect(eventDayKeys("2026-11-06", "2026-11-08")).toEqual([
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("plans N outfits for wedding span with budget envelope", () => {
    const wardrobe = [
      { id: "d1", category: "lehenga", tags: ["wedding"], closetStatus: "ACTIVE" as const },
      { id: "d2", category: "saree", tags: ["wedding"], closetStatus: "ACTIVE" as const },
      { id: "d3", category: "gown", tags: ["formal"], closetStatus: "ACTIVE" as const },
      { id: "t1", category: "kurta", tags: ["festive"], closetStatus: "ACTIVE" as const },
      { id: "t2", category: "sherwani", tags: ["wedding"], closetStatus: "ACTIVE" as const },
      { id: "b1", category: "churidar", tags: ["ethnic"], closetStatus: "ACTIVE" as const },
      { id: "s1", category: "heels", tags: ["formal"], closetStatus: "ACTIVE" as const },
      { id: "s2", category: "mojari", tags: ["wedding"], closetStatus: "ACTIVE" as const },
      { id: "s3", category: "formal shoes", tags: [], closetStatus: "ACTIVE" as const },
      { id: "casual", category: "graphic tee", tags: [], closetStatus: "ACTIVE" as const },
    ];

    const plan = planWeddingFestival(wardrobe, {
      startDate: "2026-12-10",
      endDate: "2026-12-12",
      kind: "wedding",
      label: "Riya & Arjun",
      budgetLimitMinor: 50_000_00,
      plannedSpendMinor: 42_000_00,
      piecesPerDay: 3,
    });

    expect(plan.dayCount).toBe(3);
    expect(plan.days.length).toBe(3);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12"]);
    expect(plan.days.every((d) => d.itemIds.length >= 2)).toBe(true);
    expect(plan.days[0]!.occasion).toBe("PARTY");
    expect(plan.days[1]!.occasion).toBe("FORMAL");
    expect(plan.days[2]!.occasion).toBe("PARTY");
    expect(plan.envelope).not.toBeNull();
    expect(plan.envelope!.status).toBe("WARN");
    expect(plan.envelope!.alertThresholdHit).toBe(true);
    expect(plan.label).toBe("Riya & Arjun");
  });

  it("festival day labels and occasions", () => {
    expect(dayLabelForEvent("festival", 0, 2)).toBe("Festival eve");
    expect(dayLabelForEvent("festival", 1, 2)).toBe("Main festival day");
    expect(occasionForEventDay("festival", 0, 2)).toBe("PARTY");
    expect(occasionForEventDay("festival", 1, 2)).toBe("FORMAL");
  });

  it("returns empty days when wardrobe empty but still reports dayCount", () => {
    const plan = planWeddingFestival([], {
      startDate: "2026-10-20",
      endDate: "2026-10-21",
      kind: "festival",
      label: "Diwali",
    });
    expect(plan.dayCount).toBe(2);
    expect(plan.days).toEqual([]);
    expect(plan.envelope).toBeNull();
  });
});
