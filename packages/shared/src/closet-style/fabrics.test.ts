import { describe, expect, it } from "vitest";
import {
  FABRIC_RULES,
  MATERIALS,
  MATERIAL_ALIASES,
  canonicalMaterial,
  defaultRainOk,
  defaultWarmth,
  fabricOf,
  fabricTerm,
} from "./fabrics.js";
import type { BlendedFabric, Material } from "./fabrics.js";
import { ZERO_TERM } from "./types.js";
import type { Likes, StyleDay } from "./types.js";

/** An "active" day has no occasion lean, so each rule row can be read on its own. */
const day = (over: Partial<StyleDay> = {}): StyleDay => ({
  date: "2026-10-26",
  dayType: "active",
  highC: null,
  rainChance: null,
  humidity: null,
  longDay: false,
  hours: null,
  formality: 3,
  festive: false,
  ...over,
});

const fab = (...materials: string[]): BlendedFabric => {
  const f = fabricOf(materials);
  if (!f) throw new Error(`no fabric for ${materials.join(", ")}`);
  return f;
};

const likes = (over: Partial<Likes> = {}): Likes => ({ define: [], cover: [], sit: "either", ...over });

describe("canonicalMaterial", () => {
  it("canonicalMaterial normalises free text", () => {
    expect(canonicalMaterial("60% Cotton")).toBe("cotton");
    expect(canonicalMaterial("Art-Silk")).toBe("viscose");
    expect(canonicalMaterial("cotton/poly")).toBe("cotton");
    expect(canonicalMaterial("")).toBeNull();
    expect(canonicalMaterial("unobtainium")).toBeNull();
    expect(canonicalMaterial("Mul")).toBe("cotton");
    expect(canonicalMaterial("Stretch Denim")).toBe("denim");
  });

  it("maps every canonical name to itself, with underscores or spaces", () => {
    for (const m of Object.keys(MATERIALS) as Material[]) {
      expect(canonicalMaterial(m)).toBe(m);
      expect(canonicalMaterial(` ${m.replace("_", " ").toUpperCase()} `)).toBe(m);
    }
  });

  it("maps the plan's aliases", () => {
    expect(canonicalMaterial("art silk")).toBe("viscose");
    expect(canonicalMaterial("mul")).toBe("cotton");
    expect(canonicalMaterial("Rayon")).toBe("viscose");
    expect(canonicalMaterial("Lycra")).toBe("stretch_blend");
    expect(canonicalMaterial("spandex")).toBe("stretch_blend");
    expect(canonicalMaterial("ELASTANE")).toBe("stretch_blend");
    expect(canonicalMaterial("knit")).toBe("jersey");
    expect(canonicalMaterial("PU")).toBe("faux_leather");
    expect(canonicalMaterial("Vegan Leather")).toBe("faux_leather");
    expect(canonicalMaterial("poly")).toBe("polyester");
    for (const [alias, material] of Object.entries(MATERIAL_ALIASES)) {
      expect(canonicalMaterial(alias)).toBe(material);
    }
  });

  it("reads whole words and phrases, earliest first, and never guesses", () => {
    expect(canonicalMaterial("faux-leather jacket")).toBe("faux_leather");
    expect(canonicalMaterial("PU leather")).toBe("faux_leather");
    expect(canonicalMaterial("Pure Art Silk")).toBe("viscose");
    expect(canonicalMaterial("Banarasi silk")).toBe("banarasi");
    expect(canonicalMaterial("polyester 35% cotton 65%")).toBe("polyester");
    expect(canonicalMaterial("Cotton, Linen")).toBe("cotton");
    expect(canonicalMaterial("Crêpe")).toBe("crepe");
    expect(canonicalMaterial("stretch_blend")).toBe("stretch_blend");
    expect(canonicalMaterial("100%")).toBeNull();
    expect(canonicalMaterial("   ")).toBeNull();
    expect(canonicalMaterial("acrylic")).toBeNull();
    expect(canonicalMaterial("magnetic")).toBeNull();
    expect(canonicalMaterial(undefined as unknown as string)).toBeNull();
  });
});

describe("fabricOf", () => {
  it("fabricOf blends 0.6 and 0.4", () => {
    const f = fab("linen", "cotton");
    expect(f.parts).toEqual([
      { material: "linen", weight: 0.6 },
      { material: "cotton", weight: 0.4 },
    ]);
    expect(f.profile.breathability).toBeCloseTo(5);
    expect(f.profile.crease).toBeCloseTo(0.6 * MATERIALS.linen.crease + 0.4 * MATERIALS.cotton.crease);
    expect(f.profile.warmth).toBeCloseTo(0.6 * MATERIALS.linen.warmth + 0.4 * MATERIALS.cotton.warmth);

    expect(fab("cotton", "polyester", "nylon").parts).toEqual([
      { material: "cotton", weight: 0.6 },
      { material: "polyester", weight: 0.2 },
      { material: "nylon", weight: 0.2 },
    ]);
    expect(fab("Silk").parts).toEqual([{ material: "silk", weight: 1 }]);
    expect(fab("silk").profile.sheen).toBe(MATERIALS.silk.sheen);
  });

  it("takes the union of the parts' leans", () => {
    expect([...fab("cotton", "velvet").lean].sort()).toEqual(["day", "evening", "festive"]);
    expect([...fab("linen").lean]).toEqual(["day"]);
  });

  it("fabricOf returns null when the first is unknown", () => {
    expect(fabricOf(["unobtainium", "cotton"])).toBeNull();
    expect(fabricOf(["", "cotton"])).toBeNull();
    expect(fabricOf([])).toBeNull();
  });

  it("fabricOf drops later unknowns", () => {
    expect(fab("cotton", "unobtainium").parts).toEqual([{ material: "cotton", weight: 1 }]);
    expect(fab("cotton", "polyester", "unobtainium").parts).toEqual([
      { material: "cotton", weight: 0.75 },
      { material: "polyester", weight: 0.25 },
    ]);
  });

  it("merges a material listed twice", () => {
    expect(fab("cotton", "60% Cotton").parts).toEqual([{ material: "cotton", weight: 1 }]);
  });
});

describe("the material table", () => {
  it("fabric pinned values", () => {
    expect(MATERIALS.linen.breathability).toBe(5);
    expect(MATERIALS.linen.crease).toBe(5);
    expect(MATERIALS.cotton.breathability).toBe(5);
    expect(MATERIALS.polyester.breathability).toBeLessThanOrEqual(2);
    expect(MATERIALS.polyester.rain).toBeGreaterThanOrEqual(4);
    expect(MATERIALS.nylon.rain).toBe(5);
    expect(MATERIALS.satin.sheen).toBe(5);
    expect(MATERIALS.velvet.warmth).toBeGreaterThanOrEqual(4);
    expect(MATERIALS.velvet.lean).toEqual(expect.arrayContaining(["evening", "festive"]));
    expect(MATERIALS.denim.rain).toBeLessThanOrEqual(2);
    expect(MATERIALS.denim.drape).toBeLessThanOrEqual(2);
    expect(MATERIALS.crepe.crease).toBeLessThanOrEqual(2);
    expect(MATERIALS.jersey.cling).toBeGreaterThanOrEqual(4);
    expect(MATERIALS.wool.warmth).toBe(5);
    expect(MATERIALS.brocade.lean).toContain("festive");
    expect(MATERIALS.banarasi.lean).toContain("festive");
  });

  it("holds 26 materials, each scored 1 to 5 with a lean", () => {
    const entries = Object.entries(MATERIALS);
    expect(entries).toHaveLength(26);
    for (const [, p] of entries) {
      for (const key of ["breathability", "warmth", "drape", "cling", "sheen", "crease", "care", "rain"] as const) {
        expect(Number.isInteger(p[key])).toBe(true);
        expect(p[key]).toBeGreaterThanOrEqual(1);
        expect(p[key]).toBeLessThanOrEqual(5);
      }
      expect(p.lean.length).toBeGreaterThan(0);
    }
  });
});

describe("defaults", () => {
  it("defaultWarmth follows the rounded blended warmth", () => {
    expect(defaultWarmth(fab("linen"))).toEqual({ minC: 24, maxC: 45 });
    expect(defaultWarmth(fab("cotton"))).toEqual({ minC: 18, maxC: 40 });
    expect(defaultWarmth(fab("denim"))).toEqual({ minC: 12, maxC: 32 });
    expect(defaultWarmth(fab("brocade"))).toEqual({ minC: 5, maxC: 25 });
    expect(defaultWarmth(fab("wool"))).toEqual({ minC: -10, maxC: 18 });
    // 0.6 × 1 + 0.4 × 5 = 2.6, which rounds to 3.
    expect(defaultWarmth(fab("linen", "wool"))).toEqual({ minC: 12, maxC: 32 });
  });

  it("defaultRainOk is true from rain 3", () => {
    expect(defaultRainOk(fab("polyester"))).toBe(true);
    expect(defaultRainOk(fab("linen"))).toBe(true);
    expect(defaultRainOk(fab("denim"))).toBe(false);
    expect(defaultRainOk(fab("cotton", "polyester"))).toBe(true);
    expect(defaultRainOk(fab("cotton", "denim"))).toBe(false);
  });
});

describe("fabricTerm", () => {
  it("fabricTerm gives ZERO_TERM for an unknown fabric", () => {
    expect(fabricTerm(null, day({ highC: 35, rainChance: 1, longDay: true, dayType: "work" }), likes())).toEqual(ZERO_TERM);
  });

  it("fabricTerm heat: breathable up and hot leads down from 30 °C, more when humid", () => {
    const linen = fab("linen");
    expect(fabricTerm(linen, day({ highC: 29 }), null)).toEqual(ZERO_TERM);
    expect(fabricTerm(linen, day({ highC: 30 }), null)).toEqual({
      score: 0.5,
      reasons: [{ id: "BREATHABLE_HEAT", strength: 0.5, params: { materials: "Linen", highC: 30 } }],
    });
    expect(fabricTerm(linen, day({ highC: 30, humidity: 0.69 }), null).score).toBeCloseTo(0.5);
    expect(fabricTerm(linen, day({ highC: 30, humidity: 0.7 }), null).score).toBeCloseTo(0.7);
    expect(fabricTerm(fab("linen", "cotton"), day({ highC: 34 }), null).reasons).toEqual([
      { id: "BREATHABLE_HEAT", strength: 0.5, params: { materials: "Linen and cotton", highC: 34 } },
    ]);

    expect(fabricTerm(fab("polyester"), day({ highC: 29 }), null).score).toBe(0);
    expect(fabricTerm(fab("polyester"), day({ highC: 30 }), null)).toEqual({ score: -0.5, reasons: [] });
    expect(fabricTerm(fab("polyester"), day({ highC: 30, humidity: 0.7 }), null).score).toBeCloseTo(-0.7);
    expect(fabricTerm(fab("satin"), day({ highC: 31 }), null).score).toBeCloseTo(-0.5);
    expect(fabricTerm(fab("velvet"), day({ highC: 31 }), null).score).toBeCloseTo(-0.5);
    expect(fabricTerm(fab("denim"), day({ highC: 35 }), null).score).toBe(0);
    expect(fabricTerm(linen, day({ highC: null }), null).score).toBe(0);
  });

  it("fabricTerm rain: fast-drying up and slow-drying down from 0.6", () => {
    expect(fabricTerm(fab("polyester"), day({ rainChance: 0.59 }), null)).toEqual(ZERO_TERM);
    expect(fabricTerm(fab("polyester"), day({ rainChance: 0.6 }), null)).toEqual({
      score: 0.4,
      reasons: [{ id: "DRIES_FAST", strength: 0.4, params: { material: "polyester" } }],
    });
    expect(fabricTerm(fab("denim"), day({ rainChance: 0.59 }), null).score).toBe(0);
    expect(fabricTerm(fab("denim"), day({ rainChance: 0.6 }), null)).toEqual({ score: -0.3, reasons: [] });
    expect(fabricTerm(fab("crepe"), day({ rainChance: 0.9 }), null).score).toBe(0);
    expect(fabricTerm(fab("denim"), day({ rainChance: null }), null).score).toBe(0);
  });

  it("fabricTerm long day: low-crease and breathable up, more with stretch", () => {
    expect(fabricTerm(fab("crepe"), day({ longDay: true, hours: 9 }), null)).toEqual({
      score: 0.3,
      reasons: [{ id: "LOW_CREASE_LONG_DAY", strength: 0.3, params: { material: "crepe", hours: 9 } }],
    });
    expect(fabricTerm(fab("crepe"), day({ longDay: true, hours: null }), null).reasons).toEqual([
      { id: "LOW_CREASE_LONG_DAY", strength: 0.3, params: { material: "crepe" } },
    ]);
    expect(fabricTerm(fab("jersey"), day({ longDay: true }), null).score).toBeCloseTo(0.4);
    // Breathability 0.6 × 3 + 0.4 × 4 = 3.4 and crease 1, with a jersey part.
    expect(fabricTerm(fab("crepe", "jersey"), day({ longDay: true }), null).score).toBeCloseTo(0.4);
    expect(fabricTerm(fab("linen"), day({ longDay: true }), null).score).toBe(0);
    expect(fabricTerm(fab("polyester"), day({ longDay: true }), null).score).toBe(0);
    expect(fabricTerm(fab("crepe"), day({ longDay: false, hours: 9 }), null).score).toBe(0);
  });

  it("fabricTerm occasion: the day's lean up, sheen down on work and casual days, jersey and cotton on casual days", () => {
    expect(fabricTerm(fab("cotton"), day({ dayType: "work" }), null)).toEqual({ score: 0.3, reasons: [] });
    expect(fabricTerm(fab("cotton"), day({ dayType: "casual" }), null).score).toBeCloseTo(0.4);
    expect(fabricTerm(fab("jersey"), day({ dayType: "casual" }), null).score).toBeCloseTo(0.4);
    expect(fabricTerm(fab("polyester"), day({ dayType: "casual" }), null).score).toBeCloseTo(0.3);
    expect(fabricTerm(fab("satin"), day({ dayType: "work" }), null).score).toBeCloseTo(-0.2);
    expect(fabricTerm(fab("silk"), day({ dayType: "casual" }), null).score).toBeCloseTo(-0.2);
    expect(fabricTerm(fab("satin"), day({ dayType: "evening" }), null).score).toBeCloseTo(0.3);
    expect(fabricTerm(fab("banarasi"), day({ dayType: "festive" }), null).score).toBeCloseTo(0.3);
    expect(fabricTerm(fab("cotton"), day({ dayType: "evening" }), null).score).toBe(0);
    expect(fabricTerm(fab("satin"), day({ dayType: "active" }), null).score).toBe(0);
  });

  it("fabricTerm likes: close-sitting fabric down for relaxed and cover likes", () => {
    const jersey = fab("jersey");
    expect(fabricTerm(jersey, day(), likes({ sit: "relaxed" }))).toEqual({ score: -0.3, reasons: [] });
    expect(fabricTerm(jersey, day(), likes({ cover: ["arms"] })).score).toBeCloseTo(-0.3);
    expect(fabricTerm(fab("stretch_blend"), day(), likes({ sit: "relaxed" })).score).toBeCloseTo(-0.3);
    expect(fabricTerm(jersey, day(), likes({ sit: "fitted" })).score).toBe(0);
    expect(fabricTerm(jersey, day(), likes({ sit: "either" })).score).toBe(0);
    expect(fabricTerm(jersey, day(), null).score).toBe(0);
    expect(fabricTerm(fab("cotton"), day(), likes({ sit: "relaxed", cover: ["arms"] })).score).toBe(0);
    // A zone in both define and cover is ignored for both.
    expect(fabricTerm(jersey, day(), likes({ define: ["legs"], cover: ["legs"] })).score).toBe(0);
  });

  it("fabricTerm clamps to [-1, 1]", () => {
    const hot = { highC: 34, humidity: 0.8, rainChance: 0.8, longDay: true, hours: 9 };
    // 0.7 heat + 0.4 rain + 0.3 long day + 0.3 evening lean = 1.7.
    const chiffon = fabricTerm(fab("chiffon"), day({ ...hot, dayType: "evening" }), null);
    expect(chiffon.score).toBe(1);
    expect(chiffon.reasons.map((r) => r.id)).toEqual(["BREATHABLE_HEAT", "DRIES_FAST", "LOW_CREASE_LONG_DAY"]);
    // −0.7 heat − 0.3 rain − 0.2 sheen on a work day = −1.2.
    expect(fabricTerm(fab("velvet"), day({ ...hot, dayType: "work" }), null).score).toBe(-1);
  });

  it("keeps every number in FABRIC_RULES", () => {
    expect(FABRIC_RULES.blend.leadWeight).toBe(0.6);
    expect(FABRIC_RULES.heat.minHighC).toBe(30);
    expect(FABRIC_RULES.rain.minChance).toBe(0.6);
    expect(FABRIC_RULES.rainOkMin).toBe(3);
    expect(FABRIC_RULES.warmthByScore[5]).toEqual({ minC: -10, maxC: 18 });
  });
});
