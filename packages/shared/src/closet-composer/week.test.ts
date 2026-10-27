import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_WHY_NONE, backupMissing, backupWhy } from "../closet-notes.js";
import type { CalendarTag, ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";
import type { Backup, ClosetOutfit } from "../schemas/closet-week.js";
import { BackupSchema, DayPlanSchema } from "../schemas/closet-week.js";
import { ZONES } from "./checks.js";
import { addDays } from "./dates.js";
import type { ComposeWeekInput, ComposerError, ComposerItemInput, ComposerMetric, ComposerResult, WeekComposition } from "./index.js";
import { composeBackups, composeWeek, ComposerItemSchema, ComposerSettingsSchema } from "./index.js";
import { buildCloset, CORE_SLOTS } from "./pieces.js";

const MON = "2026-11-09";
const DATES = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(MON, i));
const [, TUE, WED, THU, FRI, , SUN] = DATES;
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ATTRS: ItemAttributes = {
  v: 1,
  slot: "OTHER",
  subtype: "",
  colours: [{ name: "black", hex: "#111111", share: 1 }],
  pattern: "solid",
  materials: [],
  warmth: { minC: 0, maxC: 40 },
  rainOk: false,
  formality: 2,
  occasions: [],
  feel: [],
  coverage: {},
  fit: {},
  hair: {},
  eveningOk: false,
  confidence: {},
};

interface Spec extends Partial<ItemAttributes> {
  colour?: string | null;
  item?: Partial<ComposerItemInput>;
}

function item(n: number, slot: ItemSlot, spec: Spec = {}): ComposerItemInput {
  const { colour = "black", item: more = {}, ...attrs } = spec;
  return {
    id: id(n),
    category: slot.toLowerCase(),
    colors: [],
    costMinor: 0,
    laundryStatus: "CLEAN",
    attributesSource: "USER",
    attributes: {
      ...ATTRS,
      slot,
      subtype: slot.toLowerCase(),
      colours: [{ name: colour ?? "", hex: "#000000", share: 1 }],
      ...attrs,
    },
    ...more,
  };
}

function tag(kind: CalendarTag["kind"], start: string | null = null, end: string | null = null): CalendarTag {
  return { startLocal: start, endLocal: end, kind, formality: null, outdoor: false, allDay: false };
}

function ctx(date: string, events: CalendarTag[] = [], weather: Partial<NonNullable<ClosetDayContext["weather"]>> = {}): ClosetDayContext {
  return {
    date,
    weather: { date, tempMinC: 18, tempMaxC: 24, rainChance: 0.1, condition: "sunny", provider: "test", ...weather },
    events,
  };
}

function week(items: ComposerItemInput[], more: Partial<ComposeWeekInput> = {}): ComposeWeekInput {
  return { weekStart: MON, days: DATES.map((d) => ctx(d)), items, seed: 7, ...more };
}

function ok<T>(result: ComposerResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function err(result: ComposerResult<unknown>): ComposerError {
  if (result.ok) throw new Error("Expected an error");
  return result.error;
}

const where = (e: ComposerError) => [e.code, e.issues[0].path];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const COLOURS = ["sage", "black", "red", "cream", "navy", null];
/** Six dresses, one with no colour, and two pairs of shoes. */
const DRESSES = [
  ...COLOURS.map((colour, i) => item(i + 1, "DRESS", { colour })),
  item(20, "FOOTWEAR", { colour: "tan" }),
  item(21, "FOOTWEAR", { colour: "white" }),
];

const statuses = (w: WeekComposition) => w.days.map((d) => d.outfit.status);

/** Base piece id → the day indexes it is worn on. */
function coreUses(w: WeekComposition): Map<string, number[]> {
  const uses = new Map<string, number[]>();
  w.days.forEach((d, i) => {
    for (const [slot, itemId] of Object.entries(d.outfit.slots)) {
      if (CORE_SLOTS.has(slot as ItemSlot)) uses.set(itemId, [...(uses.get(itemId) ?? []), i]);
    }
  });
  return uses;
}

function expectWeekRules(w: WeekComposition): void {
  for (const days of coreUses(w).values()) {
    expect(days.length).toBeLessThanOrEqual(2);
    if (days.length === 2) expect(days[1] - days[0]).toBeGreaterThan(1);
  }
}

describe("composeWeek: input", () => {
  it("returns a typed error for input that doesn't parse", () => {
    expect(err(composeWeek(null)).code).toBe("INVALID_INPUT");
    expect(where(err(composeWeek({ ...week(DRESSES), days: DATES.slice(1).map((d) => ctx(d)) })))).toEqual(["INVALID_INPUT", "days"]);
    expect(where(err(composeWeek({ ...week(DRESSES), seed: 1.5 })))).toEqual(["INVALID_INPUT", "seed"]);
  });

  it("checks the week: a Monday, then its seven days in order, each with its own forecast", () => {
    expect(where(err(composeWeek(week(DRESSES, { weekStart: TUE }))))).toEqual(["NOT_A_MONDAY", "weekStart"]);
    const days = DATES.map((d) => ctx(d));
    days[3] = ctx("2026-11-20");
    expect(where(err(composeWeek(week(DRESSES, { days }))))).toEqual(["WRONG_DAYS", "days.3.date"]);
    days[3] = { ...ctx(THU), weather: { ...ctx(FRI).weather!, date: FRI } };
    expect(where(err(composeWeek(week(DRESSES, { days }))))).toEqual(["WRONG_DAYS", "days.3.weather.date"]);
    days[3] = { ...ctx(THU), weather: null };
    expect(ok(composeWeek(week(DRESSES, { days }))).days[3].context.tempMaxC).toBeNull();
  });

  it("rejects an item or a metric given twice", () => {
    expect(where(err(composeWeek(week([...DRESSES, DRESSES[0]]))))).toEqual(["INVALID_INPUT", "items.8.id"]);
    const metric: ComposerMetric = { wardrobeItemId: id(1), wearCount: 1, lastWornAt: null };
    expect(where(err(composeWeek(week(DRESSES, { metrics: [metric, metric] }))))).toEqual(["INVALID_INPUT", "metrics.1.wardrobeItemId"]);
  });

  it("checks the days already planned", () => {
    const base = ok(composeWeek(week(DRESSES)));
    const keep = (i: number, more: Partial<{ date: string; locked: boolean; outfit: ClosetOutfit }> = {}) => ({
      date: DATES[i],
      outfit: base.days[i].outfit,
      locked: false,
      ...more,
    });
    expect(where(err(composeWeek(week(DRESSES, { mode: "REST_OF_WEEK" }))))).toEqual(["WRONG_DATE", "today"]);
    expect(where(err(composeWeek(week(DRESSES, { mode: "REST_OF_WEEK", today: "2026-11-16" }))))).toEqual(["WRONG_DATE", "today"]);
    expect(where(err(composeWeek(week(DRESSES, { current: [keep(0, { date: "2026-11-16" })] }))))).toEqual(["WRONG_DATE", "current.0.date"]);
    expect(where(err(composeWeek(week(DRESSES, { current: [keep(0), keep(1, { date: MON })] }))))).toEqual(["WRONG_DATE", "current.1.date"]);
    expect(where(err(composeWeek(week(DRESSES, { current: [keep(0, { date: TUE })] }))))).toEqual([
      "WRONG_DATE",
      "current.0.outfit.plannedFor",
    ]);
    const rest = week(DRESSES, { mode: "REST_OF_WEEK", today: THU, current: [keep(0), keep(1)] });
    expect(where(err(composeWeek(rest)))).toEqual(["MISSING_PREVIOUS", "current"]);
  });

  it("reads the seed as a number, a digit string or a bigint", () => {
    const base = ok(composeWeek(week(DRESSES)));
    expect(base.seed).toBe("7");
    expect(ok(composeWeek(week(DRESSES, { seed: "7" })))).toEqual(base);
    expect(ok(composeWeek(week(DRESSES, { seed: 7n })))).toEqual(base);
  });
});

describe("composeWeek: the plan", () => {
  it("plans Monday to Sunday from the closet, one look a day, and four backups that aren't the plan", () => {
    const w = ok(composeWeek(week(DRESSES)));
    const slotOf = new Map(DRESSES.map((i) => [i.id, i.attributes?.slot]));
    expect(w.weekStart).toBe(MON);
    expect(w.composerVersion).toBe("closet-composer/2");
    expect(w.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    w.days.forEach((d, i) => {
      expect(DayPlanSchema.parse(d)).toEqual(d);
      expect(d.date).toBe(DATES[i]);
      expect(d.locked).toBe(false);
      expect(d.outfit).toMatchObject({ kind: "DAY", status: "PROPOSED", plannedFor: DATES[i], occasion: "CASUAL" });
      expect(d.outfit.score).not.toBeNull();
      for (const [slot, itemId] of Object.entries(d.outfit.slots)) expect(slotOf.get(itemId)).toBe(slot);
      expect(d.outfit.itemIds).toEqual(Object.values(d.outfit.slots).sort());
    });
    expectWeekRules(w);
    expect(w.backups.map((b) => b.check)).toEqual(["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"]);
    const dayIds = new Set(w.days.map((d) => d.outfit.id));
    for (const b of w.backups) {
      expect(BackupSchema.parse(b)).toEqual(b);
      if (b.outfit !== null) {
        expect(b.outfit).toMatchObject({ kind: "BACKUP", plannedFor: null, backupCheck: b.check });
        expect(dayIds.has(b.outfit.id)).toBe(false);
      }
    }
  });

  it("is the same week for the same input, whatever order it arrives in and whatever the clock says", () => {
    const metrics: ComposerMetric[] = [
      { wardrobeItemId: id(1), wearCount: 4, lastWornAt: "2026-08-01T10:00:00Z" },
      { wardrobeItemId: id(2), wearCount: 9, lastWornAt: "2026-11-01T10:00:00Z" },
    ];
    const days = DATES.map((d) => ctx(d));
    days[4] = ctx(FRI, [tag("OFFICE", "09:30", "17:00"), tag("DRINKS", "19:00", "21:00")]);
    const input = week(DRESSES, { metrics, days });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const base = ok(composeWeek(input));
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
    const shuffled = {
      ...input,
      items: [...DRESSES].reverse(),
      metrics: [...metrics].reverse(),
      days: days.map((d) => ({ ...d, events: [...d.events].reverse() })),
    };
    const again = ok(composeWeek(shuffled));
    expect(again.inputsHash).toBe(base.inputsHash);
    expect(again.days.map((d) => d.outfit)).toEqual(base.days.map((d) => d.outfit));
    expect(again.backups).toEqual(base.backups);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("gives every row a new id when the seed changes", () => {
    const a = ok(composeWeek(week(DRESSES)));
    const b = ok(composeWeek(week(DRESSES, { seed: 8 })));
    expect(b.inputsHash).not.toBe(a.inputsHash);
    for (let i = 0; i < 7; i++) expect(b.days[i].outfit.id).not.toBe(a.days[i].outfit.id);
  });

  it("wears one dress twice at most, never two days running, and leaves the rest of the week empty", () => {
    const w = ok(composeWeek(week([DRESSES[0], DRESSES[6]])));
    expect(statuses(w)).toEqual(["PROPOSED", "UNAVAILABLE", "PROPOSED", "UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE"]);
    expect(w.days[1].outfit).toMatchObject({
      slots: {},
      itemIds: [],
      score: null,
      note: "Nothing in the closet is free for Tuesday.",
      noteReasons: [{ rule: "DAY_UNAVAILABLE", params: { day: "Tuesday" } }],
    });
  });

  it("counts the laundry: no piece goes out more times than it has left before a wash", () => {
    const four = [...DRESSES.slice(0, 4), DRESSES[6]];
    const settings = { laundryRules: { dirtyAfterWears: 1 } };
    const fromMonday = ok(composeWeek(week(four, { settings })));
    expect(statuses(fromMonday).filter((s) => s === "UNAVAILABLE")).toHaveLength(3);
    expect([...coreUses(fromMonday).values()].every((days) => days.length === 1)).toBe(true);
    // Composed on Sunday, Monday to Saturday are already worn: the laundry state counts them.
    const fromSunday = ok(composeWeek(week(four, { settings, today: SUN })));
    expect(statuses(fromSunday).filter((s) => s === "UNAVAILABLE")).toHaveLength(0);
    expectWeekRules(fromSunday);
  });

  it("stops searching after 200 dead ends and fills what it can, tightest day first", () => {
    const six = [...DRESSES.slice(0, 6), DRESSES[6]];
    const w = ok(composeWeek(week(six, { settings: { laundryRules: { dirtyAfterWears: 1 } } })));
    expect(statuses(w).filter((s) => s === "UNAVAILABLE")).toHaveLength(1);
    expect(coreUses(w).size).toBe(6);
  });

  it("leaves a day empty when nothing in the closet suits it", () => {
    const days = DATES.map((d) => ctx(d));
    days[3] = ctx(THU, [], { rainChance: 0.9, condition: "rain" });
    const w = ok(composeWeek(week(DRESSES, { days })));
    expect(statuses(w)).toEqual(["PROPOSED", "PROPOSED", "PROPOSED", "UNAVAILABLE", "PROPOSED", "PROPOSED", "PROPOSED"]);
    expect(w.days[3].outfit.note).toBe("Nothing in the closet is free for Thursday.");
  });
});

describe("composeWeek: the sweat rule", () => {
  const gymDays = (...indexes: number[]) =>
    DATES.map((d, i) => (indexes.includes(i) ? ctx(d, [tag("GYM", "07:00", "08:00")]) : ctx(d)));
  const kit = (n: number, maxC = 40) => [
    item(n, "ACTIVE_TOP", { warmth: { minC: 0, maxC } }),
    item(n + 1, "ACTIVE_BOTTOM", { warmth: { minC: 0, maxC } }),
  ];
  const trainers = item(30, "FOOTWEAR", { colour: "white", feel: ["sporty"] });
  const rest = [...DRESSES.slice(0, 4), DRESSES[6]];

  it("doesn't wear gym kit again after a gym day before it is washed, unless the user turns the rule off", () => {
    const items = [...kit(40), trainers, ...rest];
    const on = ok(composeWeek(week(items, { days: gymDays(0, 2) })));
    expect(on.days[0].outfit.slots).toMatchObject({ ACTIVE_TOP: id(40), ACTIVE_BOTTOM: id(41), FOOTWEAR: id(30) });
    expect(statuses(on)[2]).toBe("UNAVAILABLE");
    const off = ok(composeWeek(week(items, { days: gymDays(0, 2), settings: { laundryRules: { dirtyOnSweatTag: false } } })));
    expect(off.days[2].outfit.slots).toMatchObject({ ACTIVE_TOP: id(40), ACTIVE_BOTTOM: id(41) });
  });

  it("keeps kit for a later gym day out of an earlier one", () => {
    const days = gymDays(2, 5);
    days[2] = { ...days[2], weather: { ...days[2].weather!, tempMaxC: 20 } };
    days[5] = { ...days[5], weather: { ...days[5].weather!, tempMaxC: 30 } };
    const w = ok(composeWeek(week([...kit(40), ...kit(42, 20), trainers, ...rest], { days })));
    expect(w.days[5].outfit.slots).toMatchObject({ ACTIVE_TOP: id(40), ACTIVE_BOTTOM: id(41) });
    expect(w.days[2].outfit.slots).toMatchObject({ ACTIVE_TOP: id(42), ACTIVE_BOTTOM: id(43) });
  });
});

describe("composeWeek: kept days", () => {
  const base = ok(composeWeek(week(DRESSES)));

  it("keeps a locked day as it is and plans the week around it", () => {
    const wed = base.days[2].outfit;
    const w = ok(composeWeek(week(DRESSES, { seed: 8, current: [{ date: WED, outfit: wed, locked: true }] })));
    expect(w.days[2]).toEqual({ ...base.days[2], locked: true });
    expectWeekRules(w);
  });

  it("REST_OF_WEEK keeps the days before today and replans today on", () => {
    const current = [0, 1, 2, 4].map((i) => ({ date: DATES[i], outfit: base.days[i].outfit, locked: false }));
    const w = ok(composeWeek(week(DRESSES, { seed: 8, mode: "REST_OF_WEEK", today: THU, current })));
    expect(w.days.slice(0, 3)).toEqual(base.days.slice(0, 3));
    expect(w.days[4].outfit.id).not.toBe(base.days[4].outfit.id);
    expectWeekRules(w);
  });

  it("keeps a locked day with nothing in it", () => {
    const empty: ClosetOutfit = { ...base.days[1].outfit, slots: {}, itemIds: [], status: "UNAVAILABLE", score: null };
    const w = ok(composeWeek(week(DRESSES, { current: [{ date: TUE, outfit: empty, locked: true }] })));
    expect(w.days[1].outfit).toEqual(empty);
    expect(statuses(w).filter((s) => s === "PROPOSED")).toHaveLength(6);
  });

  it("hashes the days already planned in date order", () => {
    const keep = (i: number) => ({ date: DATES[i], outfit: base.days[i].outfit, locked: false });
    const a = ok(composeWeek(week(DRESSES, { current: [keep(0), keep(3), keep(1)] })));
    const b = ok(composeWeek(week(DRESSES, { current: [keep(3), keep(1), keep(0)] })));
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.inputsHash).not.toBe(base.inputsHash);
  });
});

describe("backups", () => {
  const strip = (b: Backup) => ({ ...b, outfit: b.outfit === null ? null : { ...b.outfit, id: "" } });
  const minis = [1, 2, 3, 4].map((n) =>
    item(n, "DRESS", {
      colour: COLOURS[n - 1],
      subtype: "mini",
      neckline: "strapless",
      coverage: { shoulders: "bare", underarms: "bare", legs: "above_knee" },
    }),
  );
  const shoes = DRESSES.slice(6);

  it("leaves a check the user turned off empty", () => {
    const w = ok(composeWeek(week(DRESSES, { settings: { checksEnabled: { BLOATED: false } } })));
    expect(w.backups[1]).toEqual({ check: "BLOATED", status: "UNAVAILABLE", forDay: null, fitsDays: [], outfit: null, why: "", missing: null });
  });

  it("says so when no day trips a check, and still looks for a fix", () => {
    const w = ok(composeWeek(week(DRESSES)));
    expect(w.backups[0]).toEqual({
      check: "NOT_WAXED",
      status: "UNAVAILABLE",
      forDay: null,
      fitsDays: [],
      outfit: null,
      why: BACKUP_WHY_NONE.NOT_WAXED,
      missing: backupMissing("NOT_WAXED", ZONES, "this week"),
    });
    expect(w.backups[1]).toMatchObject({ forDay: null, why: BACKUP_WHY_NONE.BLOATED });
  });

  it("names what the closet lacks when nothing covers what the plan shows", () => {
    const w = ok(composeWeek(week([...minis, ...shoes])));
    const zones = ["shoulders", "underarms", "legs"];
    expect(w.backups[0]).toEqual({
      check: "NOT_WAXED",
      status: "UNAVAILABLE",
      forDay: MON,
      fitsDays: [],
      outfit: null,
      why: backupWhy({ check: "NOT_WAXED", day: "Monday", piece: "strapless mini", plural: false, zones }),
      missing: backupMissing("NOT_WAXED", zones, "this week"),
    });
  });

  it("finds the fix on another day when it is away on the day that tripped", () => {
    const maxi = item(9, "DRESS", {
      colour: "black",
      subtype: "maxi",
      coverage: { shoulders: "covered", underarms: "covered", legs: "floor" },
      item: { lentTo: "Priya", lentDueOn: MON },
    });
    const w = ok(composeWeek(week([...minis, maxi, ...shoes])));
    const [waxed] = w.backups;
    expect(waxed).toMatchObject({ check: "NOT_WAXED", status: "READY", forDay: MON, missing: null });
    expect(waxed.outfit?.slots.DRESS).toBe(id(9));
    expect(waxed.fitsDays).not.toContain(MON);
    expect(waxed.fitsDays).toContain(TUE);
  });

  it("skips empty days when it looks for what trips a check", () => {
    const w = ok(composeWeek(week([minis[0], ...shoes])));
    expect(w.backups[0].forDay).toBe(MON);
    expect(statuses(w)[1]).toBe("UNAVAILABLE");
    const later = ok(composeWeek(week([minis[0], ...shoes], { current: [{ date: MON, outfit: { ...w.days[0].outfit, slots: {}, itemIds: [] }, locked: true }] })));
    expect(later.backups[0].forDay).toBe(TUE);
  });

  describe("composeBackups", () => {
    const base = ok(composeWeek(week(DRESSES)));
    const input = { weekStart: MON, days: DATES.map((d) => ctx(d)), plan: base.days.map((d) => d.outfit), items: DRESSES, seed: 7 };

    it("returns typed errors", () => {
      expect(err(composeBackups(null)).code).toBe("INVALID_INPUT");
      expect(where(err(composeBackups({ ...input, weekStart: TUE })))).toEqual(["NOT_A_MONDAY", "weekStart"]);
      expect(where(err(composeBackups({ ...input, items: [...DRESSES, DRESSES[1]] })))).toEqual(["INVALID_INPUT", "items.8.id"]);
      const plan = [...input.plan];
      plan[2] = { ...plan[2], plannedFor: THU };
      expect(where(err(composeBackups({ ...input, plan })))).toEqual(["WRONG_DATE", "plan.2.plannedFor"]);
    });

    it("gives the backups the week was composed with, under new ids", () => {
      const backups = ok(composeBackups(input));
      expect(backups.map(strip)).toEqual(base.backups.map(strip));
      for (let i = 0; i < 4; i++) {
        if (backups[i].outfit !== null) expect(backups[i].outfit?.id).not.toBe(base.backups[i].outfit?.id);
      }
      const unplanned = ok(composeBackups({ ...input, plan: input.plan.map((o) => ({ ...o, plannedFor: null })), today: TUE }));
      expect(unplanned).toHaveLength(4);
    });
  });
});

/** mulberry32: a seeded generator for the test closets. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOTS: ItemSlot[] = [
  "DRESS", "DRESS", "DRESS", "TOP", "TOP", "TOP", "BOTTOM", "BOTTOM", "BOTTOM", "FOOTWEAR", "FOOTWEAR",
  "LAYER", "EARRINGS", "BAG", "HAIR_ACCESSORY", "ACTIVE_TOP", "ACTIVE_BOTTOM", "KURTA", "DUPATTA",
  "SAREE", "BLOUSE", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT",
];
const PALETTE = ["black", "white", "sage", "red", "navy", "cream", "yellow", "tan", "gold", "blue", "pink", "grey"];
const KINDS: CalendarTag["kind"][] = ["OFFICE", "WFH", "LUNCH", "DINNER", "DRINKS", "GYM", "WALK", "BRUNCH", "MEETING", "PARTY"];
const ZONE_VALUES = ["covered", "partly", "bare"] as const;
const LEGS = ["above_knee", "knee", "midi", "ankle", "floor", "trousers"] as const;

function randomCloset(r: () => number, size: number): { items: ComposerItemInput[]; metrics: ComposerMetric[] } {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
  const items: ComposerItemInput[] = [];
  const metrics: ComposerMetric[] = [];
  for (let n = 1; n <= size; n++) {
    const slot = pick(SLOTS);
    const minC = Math.floor(r() * 20);
    items.push(
      item(n, slot, {
        colour: pick(PALETTE),
        formality: 1 + Math.floor(r() * 4),
        warmth: { minC, maxC: minC + 8 + Math.floor(r() * 16) },
        rainOk: r() < 0.4,
        eveningOk: r() < 0.3,
        feel: r() < 0.25 || slot.startsWith("ACTIVE") ? ["sporty"] : [],
        coverage: { shoulders: pick(ZONE_VALUES), underarms: pick(ZONE_VALUES), legs: pick(LEGS) },
        fit: { waist: pick(["fitted", "relaxed", "ruched"] as const), hip: pick(["fitted", "relaxed"] as const) },
        hair: { upFriendly: r() < 0.5, styledDown: r() < 0.3 },
        footwear: slot === "FOOTWEAR" ? { heelCm: Math.floor(r() * 10), walkability: 1 + Math.floor(r() * 5) } : undefined,
        item: {
          laundryStatus: r() < 0.85 ? "CLEAN" : "DIRTY",
          setId: slot.startsWith("COORD") || slot === "SAREE" || slot === "BLOUSE" ? `d0000000-0000-4000-8000-00000000000${Math.floor(r() * 4)}` : null,
          costMinor: Math.floor(r() * 500000),
          priceSource: "USER",
        },
      }),
    );
    if (r() < 0.7) {
      const day = 1 + Math.floor(r() * 28);
      metrics.push({ wardrobeItemId: id(n), wearCount: Math.floor(r() * 25), lastWornAt: `2026-10-${String(day).padStart(2, "0")}T09:00:00Z` });
    }
  }
  return { items, metrics };
}

function randomDays(r: () => number): ClosetDayContext[] {
  return DATES.map((date) => {
    const events: CalendarTag[] = [];
    const count = Math.floor(r() * 3);
    for (let e = 0; e < count; e++) {
      const start = 7 + Math.floor(r() * 12);
      events.push(tag(KINDS[Math.floor(r() * KINDS.length)], `${String(start).padStart(2, "0")}:00`, `${String(start + 1 + Math.floor(r() * 4)).padStart(2, "0")}:00`));
    }
    const low = 8 + Math.floor(r() * 16);
    return ctx(date, events, { tempMinC: low, tempMaxC: low + 4 + Math.floor(r() * 8), rainChance: r() < 0.2 ? 0.8 : 0.1 });
  });
}

describe("composeWeek: random closets", () => {
  it("keeps every rule, plans only from the closet and validates, for any closet", () => {
    for (let run = 0; run < 25; run++) {
      const r = rng(1000 + run);
      const { items, metrics } = randomCloset(r, 30 + Math.floor(r() * 60));
      const settings = { laundryRules: { dirtyAfterWears: 1 + Math.floor(r() * 4) } };
      const input = week(items, { metrics, settings, days: randomDays(r), seed: run });
      const w = ok(composeWeek(input));
      const closet = buildCloset(
        items.map((i) => ComposerItemSchema.parse(i)),
        metrics,
        ComposerSettingsSchema.parse(settings),
        String(run),
        MON,
      );
      const washes = new Map<string, number>();
      for (const d of w.days) {
        expect(DayPlanSchema.safeParse(d).success).toBe(true);
        for (const [slot, itemId] of Object.entries(d.outfit.slots)) {
          const piece = closet.byId.get(itemId);
          expect(piece?.slot).toBe(slot);
          if (piece?.washed === true) washes.set(itemId, (washes.get(itemId) ?? 0) + 1);
        }
      }
      for (const [itemId, count] of washes) expect(count).toBeLessThanOrEqual(closet.byId.get(itemId)?.capacity ?? 0);
      expectWeekRules(w);
      for (const b of w.backups) expect(BackupSchema.safeParse(b).success).toBe(true);
      expect(ok(composeWeek(input))).toEqual(w);
    }
  });
});

/** v8 coverage counts every block it runs, which doubles the time, so the clock is only read without it. */
const coverage =
  (globalThis as { __vitest_worker__?: { config?: { coverage?: { enabled?: boolean } } } }).__vitest_worker__?.config
    ?.coverage?.enabled === true;

describe("composeWeek: speed", () => {
  it.skipIf(coverage)("composes a week from 1,000 items in under 50 ms", () => {
    const r = rng(42);
    const { items, metrics } = randomCloset(r, 1000);
    const input = week(items, { metrics, days: randomDays(r) });
    // The API keeps the composer warm, so the JIT gets three runs before the clock starts.
    for (let i = 0; i < 3; i++) ok(composeWeek(input));
    // Other work on the machine only ever adds time, so the fastest of seven runs is the composer's own cost.
    let fastest = Infinity;
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      ok(composeWeek(input));
      fastest = Math.min(fastest, performance.now() - start);
    }
    expect(fastest).toBeLessThan(50);
  });
});
