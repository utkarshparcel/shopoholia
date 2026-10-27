import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKUP_WHY_NONE, backupMissing, renderNote } from "../closet-notes.js";
import type { GapCandidate, StyleProfileInput } from "../closet-style/index.js";
import { BANNED_WORDS, learnPalette, proportionsOf } from "../closet-style/index.js";
import type { CalendarTag, ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";
import type { ClosetOutfit, OutfitSlots } from "../schemas/closet-week.js";
import { BackupSchema, DayPlanSchema } from "../schemas/closet-week.js";
import type { SitePiece } from "../seed/closet-site-week.js";
import { SITE_PIECES, siteItemId, siteWeekInput } from "../seed/closet-site-week.js";
import { composeBackups } from "./backups.js";
import { ZONES } from "./checks.js";
import { applySwap } from "./edits.js";
import { addDays } from "./dates.js";
import type { Day } from "./day.js";
import { toDay } from "./day.js";
import type { ComposeWeekArgs, ComposeWeekInput, ComposerItemInput, ComposerMetric, ComposerResult } from "./input.js";
import { ComposeWeekInputSchema } from "./input.js";
import type { DayStyle, Pool } from "./looks.js";
import { candidates, countLooksWith, fits, piecesOf, poolFor, weightsOf } from "./looks.js";
import { lookOf } from "./outfit.js";
import type { Closet } from "./pieces.js";
import { buildCloset, CORE_SLOTS } from "./pieces.js";
import type { WeekComposition } from "./week.js";
import { composeWeek, composeWeekWith, toStyleDay } from "./week.js";

/** Task B1: the style engine joins the composer's scores, and nothing else about the week changes. */

const MON = "2026-11-09";
const DATES = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(MON, i));
const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function ok<T>(result: ComposerResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** A seeded LCG, so every synthetic closet is the same on every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── The site's week ──────────────────────────────────────────────────────────

const NAMES = new Map((Object.keys(SITE_PIECES) as SitePiece[]).map((p) => [siteItemId(p), p]));
const named = (slots: OutfitSlots): Record<string, SitePiece | undefined> =>
  Object.fromEntries(Object.entries(slots).map(([slot, itemId]) => [slot, NAMES.get(itemId)]));

const SITE_DAYS: [string, Record<string, SitePiece>][] = [
  ["Light and bare-shouldered for a hot lunch.", { DRESS: "sage", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" }],
  ["Polished in the room, easy for nine hours.", { DRESS: "stripedMidi", FOOTWEAR: "sneakers", BAG: "clutch" }],
  ["Calls on camera, then straight out the door.", { COORD_TOP: "greyTop", COORD_BOTTOM: "greyBottom", FOOTWEAR: "runners" }],
  ["Out for the first time since June.", { DRESS: "redMini", FOOTWEAR: "heels", BAG: "clutch", EARRINGS: "drops" }],
  ["Desk to drinks without going home.", { DRESS: "yellowMidi", FOOTWEAR: "wedges", BAG: "clutch", EARRINGS: "drops" }],
  ["Cool for the heat, and a bag for the day.", { TOP: "linenShirt", BOTTOM: "shorts", FOOTWEAR: "sneakers", BAG: "strawBag" }],
  ["Nothing to think about.", { COORD_TOP: "creamTop", COORD_BOTTOM: "creamBottom", FOOTWEAR: "slides" }],
];

const SITE_BACKUPS: [string, string, string[], Record<string, SitePiece>][] = [
  [
    "Monday’s strapless mini shows shoulders, underarms and legs.",
    "Floor-length linen and a crisp tee. It reads as a choice, not a cover-up.",
    ["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-15"],
    { TOP: "whiteTee", BOTTOM: "trousers", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" },
  ],
  [
    "The sage mini is ruched and tight through the waist and hips.",
    "Nothing at the waist today. Cream linen falls from the shoulder, and the wedges keep it dressed.",
    ["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-15"],
    { DRESS: "creamMidi", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" },
  ],
  [
    "The look was built around hair down and blow-dried.",
    "Hair goes up in the claw clip, so the neckline does the talking. Black knit, nothing fussy.",
    ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13", "2026-11-15"],
    { DRESS: "blackKnit", FOOTWEAR: "wedges", BAG: "strawBag", HAIR_ACCESSORY: "clawClip" },
  ],
  [
    "Sage and a straw bag, planned for lunch at 1 in 31°.",
    "Black satin after six. Gold drops, the clutch, and the same wedges, so it’s dinner, not a gala.",
    ["2026-11-09"],
    { DRESS: "slip", FOOTWEAR: "wedges", BAG: "clutch", EARRINGS: "drops" },
  ],
];

/** An outfit without what only the style terms move. */
const unstyled = (o: ClosetOutfit | null) => (o === null ? null : { ...o, score: null, styleWhy: null });

// ── Synthetic closets ────────────────────────────────────────────────────────

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

const SLOTS: ItemSlot[] = [
  "DRESS", "DRESS", "DRESS", "TOP", "TOP", "TOP", "BOTTOM", "BOTTOM", "BOTTOM", "FOOTWEAR", "FOOTWEAR",
  "LAYER", "EARRINGS", "BAG", "HAIR_ACCESSORY", "ACTIVE_TOP", "ACTIVE_BOTTOM", "KURTA", "DUPATTA",
  "SAREE", "BLOUSE", "COORD_TOP", "COORD_BOTTOM", "JUMPSUIT",
];
const COLOURS: [string, string][] = [
  ["black", "#111111"], ["white", "#f7f7f5"], ["sage", "#9caf88"], ["red", "#b3202a"], ["navy", "#1f2a44"],
  ["cream", "#f3ead8"], ["yellow", "#e8c547"], ["tan", "#c19a6b"], ["gold", "#d4af37"], ["blue", "#4a6fa5"],
  ["pink", "#e8a0b4"], ["grey", "#9e9e9e"], ["green", "#2e7d4f"], ["purple", "#6a4c93"],
];
const MATERIALS = ["cotton", "linen", "silk", "satin", "polyester", "denim", "knit", "jersey", "wool", "viscose", "chiffon", "crepe"];
const PATTERNS = ["solid", "solid", "solid", "stripe", "floral", "print"] as const;
const ZONES_V = ["covered", "partly", "bare"] as const;
const LEGS = ["above_knee", "knee", "midi", "ankle", "floor", "trousers"] as const;
const SLEEVES = ["sleeveless", "short", "elbow", "three_quarter", "long"] as const;
const NECKLINES = ["scoop", "v", "crew", "collar", "high", "off_shoulder"] as const;
const SILHOUETTES = ["bodycon", "fitted", "a_line", "straight", "relaxed", "oversized", "flowy"] as const;
const LENGTHS = ["cropped", "waist", "hip", "thigh", "knee", "calf", "ankle", "floor"] as const;
const KINDS: CalendarTag["kind"][] = [
  "OFFICE", "WFH", "LUNCH", "DINNER", "DRINKS", "GYM", "WALK", "BRUNCH", "MEETING", "PARTY", "WEDDING", "OFFSITE",
];

/** A tagged closet with real colours, fabrics and shape fields; at most `cap` pieces a slot. */
function closetOf(r: () => number, size: number, cap = Infinity): { items: ComposerItemInput[]; metrics: ComposerMetric[] } {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
  const items: ComposerItemInput[] = [];
  const metrics: ComposerMetric[] = [];
  const perSlot = new Map<ItemSlot, number>();
  for (let n = 1; items.length < size; n++) {
    const slot = pick(SLOTS);
    if ((perSlot.get(slot) ?? 0) >= cap) continue;
    perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
    const [name, hex] = pick(COLOURS);
    const pattern = pick(PATTERNS);
    const colours = pattern === "solid" ? [{ name, hex, share: 1 }] : [{ name, hex, share: 0.6 }, { ...toColour(pick(COLOURS)), share: 0.4 }];
    const minC = Math.floor(r() * 20);
    const festive = (slot === "KURTA" || slot === "SAREE") && r() < 0.5;
    items.push({
      id: id(n),
      category: slot.toLowerCase(),
      colors: [],
      costMinor: Math.floor(r() * 500000),
      priceSource: "USER",
      laundryStatus: r() < 0.9 ? "CLEAN" : "DIRTY",
      attributesSource: r() < 0.7 ? "USER" : "MODEL",
      setId: slot.startsWith("COORD") || slot === "SAREE" || slot === "BLOUSE" ? `d0000000-0000-4000-8000-00000000000${Math.floor(r() * 4)}` : null,
      attributes: {
        ...ATTRS,
        slot,
        subtype: slot.toLowerCase(),
        colours,
        pattern,
        materials: r() < 0.15 ? [] : r() < 0.3 ? [pick(MATERIALS), pick(MATERIALS)] : [pick(MATERIALS)],
        formality: festive ? 4 : 1 + Math.floor(r() * 4),
        warmth: { minC, maxC: minC + 8 + Math.floor(r() * 16) },
        rainOk: r() < 0.4,
        eveningOk: r() < 0.3,
        feel: slot.startsWith("ACTIVE") || r() < 0.15 ? ["sporty"] : festive ? ["festive"] : [],
        coverage: { shoulders: pick(ZONES_V), underarms: pick(ZONES_V), midriff: pick(ZONES_V), back: pick(ZONES_V), legs: pick(LEGS) },
        sleeve: pick(SLEEVES),
        neckline: pick(NECKLINES),
        silhouette: pick(SILHOUETTES),
        fit: { waist: pick(["fitted", "relaxed", "ruched", "defined"] as const), hip: pick(["fitted", "relaxed"] as const) },
        rise: slot === "BOTTOM" ? pick(["high", "mid", "low"] as const) : undefined,
        length: pick(LENGTHS),
        volumeAt: r() < 0.3 ? [pick(["shoulders", "sleeves", "hem"] as const)] : undefined,
        hair: { upFriendly: r() < 0.5, styledDown: r() < 0.3 },
        footwear: slot === "FOOTWEAR" ? { heelCm: Math.floor(r() * 10), walkability: 1 + Math.floor(r() * 5) } : undefined,
        confidence: { fit: 0.9, coverage: 0.85, silhouette: 0.9, length: 0.9, rise: 0.9, volumeAt: 0.9 },
      },
    });
    if (r() < 0.7) {
      const day = 1 + Math.floor(r() * 28);
      metrics.push({
        wardrobeItemId: id(n),
        wearCount: Math.floor(r() * 25),
        lastWornAt: `2026-10-${String(day).padStart(2, "0")}T09:00:00Z`,
        wears180: Math.floor(r() * 30),
      });
    }
  }
  return { items, metrics };
}

function toColour([name, hex]: [string, string]): { name: string; hex: string; share: number } {
  return { name, hex, share: 1 };
}

function tag(kind: CalendarTag["kind"], start: string, end: string): CalendarTag {
  return { startLocal: start, endLocal: end, kind, formality: null, outdoor: false, allDay: false };
}

function daysOf(r: () => number): ClosetDayContext[] {
  return DATES.map((date) => {
    const events: CalendarTag[] = [];
    const count = Math.floor(r() * 3);
    for (let e = 0; e < count; e++) {
      const start = 7 + Math.floor(r() * 10);
      const span = 1 + Math.floor(r() * 9);
      events.push(tag(KINDS[Math.floor(r() * KINDS.length)], `${String(start).padStart(2, "0")}:00`, `${String(Math.min(start + span, 23)).padStart(2, "0")}:00`));
    }
    const low = 8 + Math.floor(r() * 18);
    const weather = { date, tempMinC: low, tempMaxC: low + 4 + Math.floor(r() * 10), rainChance: r() < 0.25 ? 0.8 : 0.1, condition: "sunny", provider: "test" };
    return { date, weather, events };
  });
}

function input(r: () => number, size: number, seed: number, more: Partial<ComposeWeekInput> = {}, cap = Infinity): ComposeWeekInput {
  const { items, metrics } = closetOf(r, size, cap);
  return { weekStart: MON, days: daysOf(r), items, metrics, seed, ...more };
}

const LIKES: StyleProfileInput = {
  version: 3,
  likes: { define: ["waist"], cover: ["arms"], sit: "relaxed" },
  proportions: null,
  learned: [
    { dayType: "casual", feature: "colour:green", value: 0.8, support: 4 },
    { dayType: "work", feature: "fabric:linen", value: -0.6, support: 5 },
    { dayType: "evening", feature: "silhouette:bodycon", value: 0.7, support: 3 },
  ],
};
const TAPE: StyleProfileInput = {
  version: 1,
  likes: null,
  proportions: proportionsOf({ bustCm: 92, waistCm: 70, hipCm: 100, shoulderCm: 38 }),
  learned: [],
};
const TAPE_AND_PHOTO: StyleProfileInput = {
  version: 2,
  likes: { define: ["shoulders"], cover: ["legs"], sit: "fitted" },
  proportions: proportionsOf({
    bustCm: 92,
    waistCm: 70,
    hipCm: 100,
    shoulderCm: 38,
    photo: { shoulderWidth: 38, waistWidth: 28, hipWidth: 36, torsoLength: 52, legLength: 80, quality: "good" },
  }),
  learned: [{ dayType: "casual", feature: "pattern:floral", value: -0.9, support: 6 }],
};
const PROFILES: [string, StyleProfileInput | null][] = [
  ["none", null],
  ["likes only", LIKES],
  ["tape", TAPE],
  ["tape + photo", TAPE_AND_PHOTO],
];

function parsed(i: ComposeWeekInput): { a: ComposeWeekArgs; closet: Closet; days: Day[] } {
  const a = ComposeWeekInputSchema.parse(i);
  const closet = buildCloset(a.items, a.metrics, a.settings, a.seed, a.today ?? a.weekStart);
  return { a, closet, days: a.days.map(toDay) };
}

function styleFor(a: ComposeWeekArgs, day: Day, profile: StyleProfileInput | null): DayStyle {
  const palette = learnPalette(a.items, a.metrics.map((m) => ({ itemId: m.wardrobeItemId, wears180: m.wears180 ?? 0 })));
  const rainChance = a.days[day.index].weather?.rainChance ?? null;
  return { day: toStyleDay(day, rainChance), ctx: { profile, palette }, multipliers: {} };
}

/** A day's passing looks, as their base pieces: footwear, layers and dupattas are picked by score, so only whether one joins counts. */
function passing(pool: Pool): string[] {
  const found = candidates(pool, {}, 1e9);
  expect(found.looks.length).toBe(found.count);
  for (const look of found.looks) expect(fits(look, pool.day, "2026-11-09")).toBe(true);
  return found.looks.map((l) => `${l.core.map((p) => p.id).join("+")}|${l.dupatta !== null}|${l.layer !== null}`).sort();
}

function members(pool: Pool): string[] {
  const ids = (list: readonly { id: string }[]) => list.map((p) => p.id).sort().join(",");
  return [
    ...Object.entries(pool.core).map(([slot, list]) => `${slot}:${ids(list.map((s) => s.piece))}`),
    `layers:${ids(pool.layers)}`,
    `dupattas:${ids(pool.dupattas)}`,
    `footwear:${ids(pool.footwear)}`,
  ];
}

function coreKey(outfit: ClosetOutfit, closet: Closet): string {
  return lookOf(outfit, closet).core.map((p) => p.id).join("+");
}

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

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── The tests ────────────────────────────────────────────────────────────────

describe("the style engine in the composer", () => {
  it("site parity fixture lines unchanged", () => {
    const w = ok(composeWeek(siteWeekInput()));
    const off = ok(composeWeekWith(siteWeekInput(), { style: false }));
    expect(w.composerVersion).toBe("closet-composer/2");
    w.days.forEach((d, i) => {
      const [note, look] = SITE_DAYS[i]!;
      expect(d.outfit.note).toBe(note);
      expect(d.outfit.status).toBe("PROPOSED");
      expect(named(d.outfit.slots)).toEqual(look);
      expect(DayPlanSchema.parse(d)).toEqual(d);
      expect(unstyled(d.outfit)).toEqual(unstyled(off.days[i]!.outfit));
    });
    expect(renderNote(w.days[0]!.outfit.noteReasons)).toBe("Sage and tan, same warmth. Gold hoops because the neckline’s bare.");
    w.backups.forEach((b, i) => {
      const [why, note, fitsDays, look] = SITE_BACKUPS[i]!;
      expect(b).toMatchObject({ status: "READY", forDay: "2026-11-09", missing: null, why, fitsDays });
      expect(b.outfit?.note).toBe(note);
      expect(b.outfit?.styleWhy).toBeNull();
      expect(named(b.outfit?.slots ?? {})).toEqual(look);
      expect(BackupSchema.parse(b)).toEqual(b);
    });
    expect(w.backups).toEqual(off.backups);
    // With a profile the days may change; the backups follow that plan, built as composeBackups builds them.
    const styled = ok(composeWeek({ ...siteWeekInput(), styleProfile: TAPE_AND_PHOTO }));
    const rebuilt = ok(composeBackups({ ...siteWeekInput(), plan: styled.days.map((d) => d.outfit) }));
    const noIds = (bs: typeof rebuilt) => bs.map((b) => ({ ...b, outfit: b.outfit === null ? null : { ...b.outfit, id: "" } }));
    expect(noIds(styled.backups)).toEqual(noIds(rebuilt));
    for (const b of styled.backups) expect(b.outfit?.styleWhy ?? null).toBeNull();
  });

  it("a swap clears styleWhy", () => {
    const i = siteWeekInput();
    const mon = ok(composeWeek(i)).days[0]!.outfit;
    expect(mon.styleWhy).toBe("Jersey for a 31° day.");
    const { items, metrics, settings, seed } = i;
    const swap = { slot: "FOOTWEAR" as const, itemId: siteItemId("sneakers") };
    const r = ok(applySwap({ context: i.days[0]!, outfit: mon, swap, items, metrics, settings, seed }));
    if (r.status !== "APPLIED") throw new Error(r.status);
    expect(r.outfit.slots.FOOTWEAR).toBe(siteItemId("sneakers"));
    expect(r.outfit.styleWhy).toBeNull();
  });

  it("compose with an empty closet and no profile is unchanged", () => {
    const empty: ComposeWeekInput = { weekStart: MON, days: daysOf(lcg(5)), items: [], seed: 7 };
    const w = ok(composeWeek(empty));
    expect(ok(composeWeek({ ...empty, styleProfile: null }))).toEqual(w);
    expect(ok(composeWeek({ ...empty, metrics: [] }))).toEqual(w);
    expect(ok(composeWeekWith(empty, { style: false }))).toEqual(w);
    w.days.forEach((d, i) => {
      expect(d.outfit).toMatchObject({
        status: "UNAVAILABLE",
        slots: {},
        itemIds: [],
        score: null,
        styleWhy: null,
        plannedFor: DATES[i],
        composerVersion: "closet-composer/2",
      });
      expect(d.outfit.note).toMatch(/^Nothing in the closet is free for \w+day\.$/);
    });
    expect(w.backups).toEqual(
      (["NOT_WAXED", "BLOATED", "BAD_HAIR", "PARTY_DATE"] as const).map((check) => ({
        check,
        status: "UNAVAILABLE",
        forDay: null,
        fitsDays: [],
        outfit: null,
        why: BACKUP_WHY_NONE[check],
        missing: backupMissing(check, ZONES, "this week"),
      })),
    );
  });

  it("same passing set with and without a profile", () => {
    for (let run = 0; run < 20; run++) {
      const r = lcg(2000 + run);
      const i = input(r, 20 + Math.floor(r() * 21), run, {}, 12);
      const { a, closet, days } = parsed(i);
      const weights = weightsOf(a.settings);
      const base = days.map((day) => poolFor(closet, day, weights));
      const sets = base.map(passing);
      for (const [label, profile] of PROFILES) {
        days.forEach((day, d) => {
          const pool = poolFor(closet, day, weights, styleFor(a, day, profile));
          expect(members(pool), `${run} ${label} ${day.date}`).toEqual(members(base[d]!));
          expect(passing(pool), `${run} ${label} ${day.date}`).toEqual(sets[d]);
        });
        const w = ok(composeWeek({ ...i, styleProfile: profile }));
        w.days.forEach((d, n) => {
          // A day with no passing look gets none; one with looks can still lose them to the week's rules.
          if (sets[n]!.length === 0) expect(d.outfit.status).toBe("UNAVAILABLE");
          if (d.outfit.status === "UNAVAILABLE") return;
          const key = coreKey(d.outfit, closet);
          expect(sets[n]!.some((k) => k.startsWith(`${key}|`)), `${run} ${label} ${d.date}`).toBe(true);
        });
      }
    }
  });

  it("deterministic", () => {
    const i = input(lcg(77), 60, 3, { styleProfile: TAPE_AND_PHOTO });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const base = ok(composeWeek(i));
    vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
    const profile = TAPE_AND_PHOTO;
    const shuffled: ComposeWeekInput = {
      ...i,
      items: [...(i.items ?? [])].reverse(),
      metrics: [...(i.metrics ?? [])].reverse(),
      styleProfile: {
        ...profile,
        likes: profile.likes && { ...profile.likes, define: [...profile.likes.define].reverse(), cover: [...profile.likes.cover].reverse() },
        learned: [...profile.learned].reverse(),
      },
    };
    expect(ok(composeWeek(shuffled))).toEqual(base);
    expect(ok(composeWeek(i))).toEqual(base);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    // The palette learns from wears180 and the profile steers the score, so both are in the hash.
    const metrics = (i.metrics ?? []).map((m, n) => (n === 0 ? { ...m, wears180: (m.wears180 ?? 0) + 5 } : m));
    expect(ok(composeWeek({ ...i, metrics })).inputsHash).not.toBe(base.inputsHash);
    expect(ok(composeWeek({ ...i, styleProfile: TAPE })).inputsHash).not.toBe(base.inputsHash);
    expect(ok(composeWeek({ ...i, styleProfile: null })).inputsHash).not.toBe(base.inputsHash);
    expect(ok(composeWeek({ ...i, styleProfile: null }))).toEqual(ok(composeWeek({ ...i, styleProfile: undefined })));
  });

  it("no violations", () => {
    for (let run = 0; run < 12; run++) {
      const r = lcg(3000 + run);
      const size = 30 + Math.floor(r() * 60);
      const settings = { laundryRules: { dirtyAfterWears: 1 + Math.floor(r() * 4) } };
      const [, profile] = PROFILES[run % PROFILES.length]!;
      const i = input(r, size, run, { settings, styleProfile: profile });
      const { closet, days } = parsed(i);
      const w = ok(composeWeek(i));
      const washes = new Map<string, number>();
      w.days.forEach((d, n) => {
        expect(DayPlanSchema.safeParse(d).success).toBe(true);
        if (d.outfit.status === "UNAVAILABLE") return;
        const look = lookOf(d.outfit, closet);
        expect(piecesOf(look).length).toBe(Object.keys(d.outfit.slots).length);
        expect(fits(look, days[n]!, closet.asOf)).toBe(true);
        for (const p of piecesOf(look)) if (p.washed) washes.set(p.id, (washes.get(p.id) ?? 0) + 1);
      });
      for (const [itemId, count] of washes) expect(count).toBeLessThanOrEqual(closet.byId.get(itemId)?.capacity ?? 0);
      for (const uses of coreUses(w).values()) {
        expect(uses.length).toBeLessThanOrEqual(2);
        if (uses.length === 2) expect(uses[1]! - uses[0]!).toBeGreaterThan(1);
      }
      for (const b of w.backups) expect(BackupSchema.safeParse(b).success).toBe(true);
    }
  });

  it("styleWhy shows at most two phrases", () => {
    let shown = 0;
    for (let run = 0; run < 16; run++) {
      const r = lcg(4000 + run);
      const [, profile] = PROFILES[run % PROFILES.length]!;
      const w = ok(composeWeek(input(r, 40 + Math.floor(r() * 40), run, { styleProfile: profile })));
      for (const d of w.days) {
        const why = d.outfit.styleWhy;
        if (d.outfit.status === "UNAVAILABLE") expect(why).toBeNull();
        if (why === null) continue;
        shown++;
        const phrases = why.split(/(?<=[.!?])\s+/);
        expect(phrases.length, why).toBeLessThanOrEqual(2);
        for (const phrase of phrases) expect(phrase, why).toMatch(/^[A-Z].*[.!?]$/u);
        for (const word of BANNED_WORDS) expect(why, word).not.toMatch(new RegExp(`\\b${escape(word)}\\b`, "iu"));
      }
      for (const b of w.backups) expect(b.outfit?.styleWhy ?? null).toBeNull();
    }
    expect(shown).toBeGreaterThan(0);
  });

  it("budget", () => {
    const i = input(lcg(42), 300, 9, { styleProfile: { ...TAPE_AND_PHOTO, likes: LIKES.likes, learned: LIKES.learned } });
    const time = (style: boolean): number => {
      for (let n = 0; n < 3; n++) ok(composeWeekWith(i, { style }));
      let fastest = Infinity;
      for (let n = 0; n < 5; n++) {
        const start = performance.now();
        ok(composeWeekWith(i, { style }));
        fastest = Math.min(fastest, performance.now() - start);
      }
      return fastest;
    };
    const off = time(false);
    const on = time(true);
    console.info(`style budget, 300 pieces: off ${off.toFixed(2)} ms, on ${on.toFixed(2)} ms`);
    expect(on).toBeLessThan(350);
    expect(on - off).toBeLessThan(50);
  });

  it("countLooksWith counts the new looks a candidate makes", () => {
    const piece = (n: number, slot: ItemSlot, more: Partial<ItemAttributes> = {}): ComposerItemInput => ({
      id: id(800 + n), category: slot.toLowerCase(), colors: [], costMinor: 0, laundryStatus: "CLEAN", attributesSource: "USER",
      attributes: { ...ATTRS, slot, subtype: slot.toLowerCase(), ...more },
    });
    const base = [piece(1, "TOP"), piece(2, "TOP"), piece(3, "BOTTOM"), piece(4, "BOTTOM"), piece(5, "DRESS", { neckline: "strapless" })];
    const shoe = piece(6, "FOOTWEAR", { rainOk: true });
    const chilly = piece(7, "DRESS", { warmth: { minC: 24, maxC: 40 } });
    const week = (items: ComposerItemInput[]) =>
      parsed({
        weekStart: MON,
        seed: 3,
        items,
        days: DATES.map((date, i) => ({
          date,
          events: [],
          weather: { date, tempMinC: 20, tempMaxC: 26, rainChance: i === 1 ? 0.8 : 0.1, condition: "sunny", provider: "test" },
        })),
      });
    const black: GapCandidate = { slot: "FOOTWEAR", family: "neutral", band: "deep", neutral: "black", feature: null };
    const bare = week(base);
    const [dry, wet] = bare.days as [Day, Day];
    expect(wet.rainy).toBe(true);
    const w = weightsOf(bare.a.settings);
    for (const d of bare.days) expect(candidates(poolFor(bare.closet, d, w), {}, 1).count).toBe(0);

    // Footwear unlocks every base look; on a rainy day only footwear made for rain does.
    expect(countLooksWith(bare.closet, black, [dry])).toBe(5);
    expect(countLooksWith(bare.closet, black, [wet])).toBe(0);
    const rainy = { ...black, feature: "rain_ok" as const };
    expect(countLooksWith(bare.closet, rainy, bare.days)).toBe(35);
    const shod = week([...base, shoe]);
    const real = shod.days.reduce((n, d) => n + candidates(poolFor(shod.closet, d, w), {}, 1).count, 0);
    expect(countLooksWith(bare.closet, rainy, bare.days)).toBe(real);

    // A base piece counts only the looks it is in; earrings join where the neckline's bare.
    expect(countLooksWith(shod.closet, { ...black, slot: "TOP" }, [dry])).toBe(2);
    expect(countLooksWith(shod.closet, { ...black, slot: "EARRINGS", band: "light", family: "yellow", neutral: null }, [dry])).toBe(1);
    expect(countLooksWith(shod.closet, { ...black, slot: "OTHER" }, [dry])).toBe(0);

    // A layer unlocks the dress that needs one, and nothing else.
    const cold = week([...base, shoe, chilly]);
    expect(candidates(poolFor(cold.closet, dry, w), {}, 1).count).toBe(5);
    expect(countLooksWith(cold.closet, { ...black, slot: "LAYER" }, [dry])).toBe(1);

    // The closet is left as it was, and the count is the same every time.
    expect(cold.closet.bySlot.get("LAYER")).toBeUndefined();
    expect(cold.closet.pieces).toHaveLength(7);
    expect(countLooksWith(cold.closet, { ...black, slot: "LAYER" }, [dry])).toBe(1);
  });
});
