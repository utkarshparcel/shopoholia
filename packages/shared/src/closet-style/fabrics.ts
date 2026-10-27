import { ZERO_TERM } from "./types.js";
import type { DayType, Likes, StyleDay, StyleReason, Term } from "./types.js";

/** The canonical materials (spec §5.4). Free text maps to one of these, or to unknown. */
export type Material =
  | "cotton" | "mulmul" | "khadi" | "linen" | "chambray" | "denim"
  | "silk" | "satin" | "chiffon" | "georgette" | "crepe" | "organza" | "net" | "brocade" | "banarasi" | "chanderi"
  | "viscose" | "modal" | "polyester" | "nylon" | "wool"
  | "velvet" | "jersey" | "stretch_blend"
  | "leather" | "faux_leather";

/** The occasions a material leans toward. */
export type FabricLean = "day" | "evening" | "festive";

/** How a material behaves. Every score is an integer from 1 to 5. */
export interface FabricProfile {
  breathability: number;
  warmth: number;
  /** 1 structured … 5 fluid. */
  drape: number;
  /** 5 sits closest. */
  cling: number;
  sheen: number;
  /** 5 creases most. */
  crease: number;
  /** 5 is easiest to look after. */
  care: number;
  /** 5 dries fastest; 1 marks with water or stays wet. */
  rain: number;
  lean: readonly FabricLean[];
}

type Scores = Omit<FabricProfile, "lean">;
const p = (s: [number, number, number, number, number, number, number, number], lean: readonly FabricLean[]): FabricProfile => ({
  breathability: s[0], warmth: s[1], drape: s[2], cling: s[3], sheen: s[4], crease: s[5], care: s[6], rain: s[7], lean,
});

/**
 * The material table. Starting values for the stylist to review.
 * Columns: breathability, warmth, drape, cling, sheen, crease, care, rain.
 */
export const MATERIALS: Readonly<Record<Material, FabricProfile>> = {
  // Plant fibres
  cotton:        p([5, 2, 3, 2, 1, 4, 5, 2], ["day"]),
  mulmul:        p([5, 1, 4, 2, 1, 4, 3, 2], ["day"]),
  khadi:         p([5, 2, 2, 1, 1, 4, 3, 2], ["day"]),
  linen:         p([5, 1, 2, 1, 2, 5, 3, 3], ["day"]),
  chambray:      p([4, 2, 3, 1, 1, 3, 5, 2], ["day"]),
  denim:         p([3, 3, 1, 2, 1, 2, 4, 1], ["day"]),
  // Silks and silk-like
  silk:          p([4, 3, 4, 3, 4, 3, 1, 1], ["evening", "festive"]),
  satin:         p([2, 2, 5, 4, 5, 3, 2, 2], ["evening", "festive"]),
  chiffon:       p([4, 1, 5, 2, 2, 2, 2, 4], ["day", "evening"]),
  georgette:     p([3, 1, 4, 2, 1, 2, 3, 4], ["day", "evening"]),
  crepe:         p([3, 2, 4, 2, 1, 1, 4, 3], ["day", "evening"]),
  organza:       p([3, 1, 1, 1, 4, 3, 2, 3], ["evening", "festive"]),
  net:           p([4, 1, 3, 1, 2, 1, 2, 4], ["evening", "festive"]),
  brocade:       p([2, 4, 1, 1, 4, 2, 1, 1], ["evening", "festive"]),
  banarasi:      p([2, 3, 2, 1, 4, 2, 1, 1], ["festive"]),
  chanderi:      p([4, 1, 3, 1, 3, 3, 2, 2], ["day", "festive"]),
  // Man-made and wool
  viscose:       p([4, 2, 5, 3, 2, 4, 3, 2], ["day"]),
  modal:         p([4, 2, 5, 3, 2, 2, 4, 3], ["day"]),
  polyester:     p([1, 2, 3, 3, 2, 1, 5, 5], ["day"]),
  nylon:         p([1, 2, 3, 3, 3, 1, 5, 5], ["day"]),
  wool:          p([3, 5, 3, 1, 1, 2, 1, 2], ["day", "evening"]),
  // Pile and knits
  velvet:        p([1, 5, 3, 2, 4, 3, 1, 1], ["evening", "festive"]),
  jersey:        p([4, 2, 4, 4, 1, 1, 5, 3], ["day"]),
  stretch_blend: p([2, 2, 3, 5, 2, 1, 4, 4], ["day"]),
  // Leather
  leather:       p([1, 4, 1, 2, 3, 2, 1, 1], ["day", "evening"]),
  faux_leather:  p([1, 3, 1, 2, 4, 2, 4, 4], ["day", "evening"]),
};

/** Words for each material in reason params. */
export const MATERIAL_NAMES: Readonly<Record<Material, string>> = {
  cotton: "cotton", mulmul: "mulmul", khadi: "khadi", linen: "linen", chambray: "chambray", denim: "denim",
  silk: "silk", satin: "satin", chiffon: "chiffon", georgette: "georgette", crepe: "crepe", organza: "organza",
  net: "net", brocade: "brocade", banarasi: "Banarasi", chanderi: "Chanderi",
  viscose: "viscose", modal: "modal", polyester: "polyester", nylon: "nylon", wool: "wool",
  velvet: "velvet", jersey: "jersey", stretch_blend: "stretch fabric",
  leather: "leather", faux_leather: "faux leather",
};

/** Other names for the canonical materials, already normalised (lowercase, single spaces). */
export const MATERIAL_ALIASES: Readonly<Record<string, Material>> = {
  "art silk": "viscose",
  "artificial silk": "viscose",
  "rayon": "viscose",
  "faux silk": "polyester",
  "mul": "cotton",
  "mul mul": "mulmul",
  "malmal": "mulmul",
  "muslin": "mulmul",
  "khaddar": "khadi",
  "flax": "linen",
  "jean": "denim",
  "jeans": "denim",
  "tussar": "silk",
  "kanjivaram": "silk",
  "kanjeevaram": "silk",
  "banarsi": "banarasi",
  "benarasi": "banarasi",
  "tulle": "net",
  "poly": "polyester",
  "polyster": "polyester",
  "terylene": "polyester",
  "polyamide": "nylon",
  "pashmina": "wool",
  "cashmere": "wool",
  "merino": "wool",
  "velour": "velvet",
  "knit": "jersey",
  "knitted": "jersey",
  "hosiery": "jersey",
  "lycra": "stretch_blend",
  "spandex": "stretch_blend",
  "elastane": "stretch_blend",
  "pu": "faux_leather",
  "vegan leather": "faux_leather",
  "leatherette": "faux_leather",
  "pleather": "faux_leather",
};

/** Every number the fabric rules use (spec §5.4). Starting values for the stylist to tune. */
export const FABRIC_RULES = {
  blend: { leadWeight: 0.6 },
  /** `rainOk` defaults to true from this blended rain score. */
  rainOkMin: 3,
  /** The default warmth range by the rounded blended warmth. */
  warmthByScore: {
    1: { minC: 24, maxC: 45 },
    2: { minC: 18, maxC: 40 },
    3: { minC: 12, maxC: 32 },
    4: { minC: 5, maxC: 25 },
    5: { minC: -10, maxC: 18 },
  },
  heat: {
    minHighC: 30,
    breathableMin: 4,
    breathable: 0.5,
    hotLeads: ["polyester", "satin", "velvet"] as readonly Material[],
    hotLead: -0.5,
    humidMin: 0.7,
    /** Added in the direction the heat already pushes. */
    humid: 0.2,
  },
  rain: { minChance: 0.6, fastMin: 4, fast: 0.4, slowMax: 2, slow: -0.3 },
  longDay: {
    creaseMax: 2,
    breathableMin: 3,
    lowCrease: 0.3,
    stretchParts: ["stretch_blend", "jersey"] as readonly Material[],
    stretch: 0.1,
  },
  occasion: {
    leanByDay: { work: "day", casual: "day", evening: "evening", festive: "festive" } as Readonly<Partial<Record<DayType, FabricLean>>>,
    lean: 0.3,
    sheenMin: 4,
    sheenDays: ["work", "casual"] as readonly DayType[],
    sheen: -0.2,
    casualLeads: ["jersey", "cotton"] as readonly Material[],
    casualLead: 0.1,
  },
  /** Cling at or above this counts as "sits close" for the relaxed and cover likes. */
  likes: { clingMin: 4, sitsClose: -0.3 },
} as const;

const NAME_INDEX: ReadonlyMap<string, Material> = new Map(
  (Object.keys(MATERIALS) as Material[]).map((m) => [m.replace(/_/g, " "), m]),
);
const ALIAS_INDEX: ReadonlyMap<string, Material> = new Map(Object.entries(MATERIAL_ALIASES));
const MAX_PHRASE_WORDS = Math.max(...[...NAME_INDEX.keys(), ...ALIAS_INDEX.keys()].map((k) => k.split(" ").length));

function lookup(phrase: string): Material | null {
  return NAME_INDEX.get(phrase) ?? ALIAS_INDEX.get(phrase) ?? null;
}

/**
 * The canonical material for free text, or null when it isn't one we know (spec §5.4: unknown never guesses).
 * Lowercases, drops accents, percentages and digits, turns punctuation ("-", "_", "/", ",") into spaces,
 * trims, then checks the exact name, then aliases, then whole words and phrases from the left.
 */
export function canonicalMaterial(raw: string): Material | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\d%]+/g, " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
  if (text === "") return null;
  const exact = lookup(text);
  if (exact) return exact;
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1; n--) {
      const hit = lookup(words.slice(i, i + n).join(" "));
      if (hit) return hit;
    }
  }
  return null;
}

/** A piece's fabric: its parts by weight, the weighted profile and the union of the leans. */
export interface BlendedFabric {
  parts: readonly { material: Material; weight: number }[];
  profile: Readonly<Record<Exclude<keyof FabricProfile, "lean">, number>>;
  lean: ReadonlySet<FabricLean>;
}

const SCORE_KEYS: readonly (keyof Scores)[] = ["breathability", "warmth", "drape", "cling", "sheen", "crease", "care", "rain"];
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/**
 * Blends a piece's materials. The first leads at 0.6 and the rest share 0.4 (a single material weighs 1).
 * Later unknowns are dropped and the rest renormalised. An unknown first material gives null.
 */
export function fabricOf(materials: readonly string[]): BlendedFabric | null {
  if (materials.length === 0) return null;
  const lead = canonicalMaterial(materials[0]!);
  if (!lead) return null;
  const rest = materials.length - 1;
  const restWeight = rest === 0 ? 0 : (1 - FABRIC_RULES.blend.leadWeight) / rest;
  const weights = new Map<Material, number>([[lead, rest === 0 ? 1 : FABRIC_RULES.blend.leadWeight]]);
  for (const raw of materials.slice(1)) {
    const m = canonicalMaterial(raw);
    if (m) weights.set(m, (weights.get(m) ?? 0) + restWeight);
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const parts = [...weights].map(([material, w]) => ({ material, weight: round6(w / total) }));
  const profile = {} as Record<keyof Scores, number>;
  for (const key of SCORE_KEYS) {
    profile[key] = round6(parts.reduce((sum, part) => sum + MATERIALS[part.material][key] * part.weight, 0));
  }
  const lean = new Set<FabricLean>(parts.flatMap((part) => MATERIALS[part.material].lean));
  return { parts, profile, lean };
}

/** The warmth range a fabric suggests when tagging left it empty. */
export function defaultWarmth(f: BlendedFabric): { minC: number; maxC: number } {
  const score = Math.min(5, Math.max(1, Math.round(f.profile.warmth))) as keyof typeof FABRIC_RULES.warmthByScore;
  const range = FABRIC_RULES.warmthByScore[score];
  return { minC: range.minC, maxC: range.maxC };
}

/** Whether a fabric suits a rainy day when tagging left `rainOk` empty. */
export function defaultRainOk(f: BlendedFabric): boolean {
  return f.profile.rain >= FABRIC_RULES.rainOkMin;
}

const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The fabric term (spec §5.4): the fabric against the day's weather, length and occasion, and the likes. */
export function fabricTerm(f: BlendedFabric | null, day: StyleDay, likes: Likes | null): Term {
  if (!f) return ZERO_TERM;
  const R = FABRIC_RULES;
  const s = f.profile;
  const lead = f.parts[0]!.material;
  const leadName = MATERIAL_NAMES[lead];
  const reasons: StyleReason[] = [];
  let score = 0;

  if (day.highC !== null && day.highC >= R.heat.minHighC) {
    const humid = day.humidity !== null && day.humidity >= R.heat.humidMin;
    if (s.breathability >= R.heat.breathableMin) {
      const up = R.heat.breathable + (humid ? R.heat.humid : 0);
      // A blended score of 4 or more means at least one part scores 4 or more on its own.
      const names = f.parts.filter((part) => MATERIALS[part.material].breathability >= R.heat.breathableMin);
      const materials = sentence(names.map((part) => MATERIAL_NAMES[part.material]).join(" and "));
      score += up;
      reasons.push({ id: "BREATHABLE_HEAT", strength: up, params: { materials, highC: Math.round(day.highC) } });
    }
    if (R.heat.hotLeads.includes(lead)) score += R.heat.hotLead - (humid ? R.heat.humid : 0);
  }

  if (day.rainChance !== null && day.rainChance >= R.rain.minChance) {
    if (s.rain >= R.rain.fastMin) {
      score += R.rain.fast;
      reasons.push({ id: "DRIES_FAST", strength: R.rain.fast, params: { material: leadName } });
    } else if (s.rain <= R.rain.slowMax) {
      score += R.rain.slow;
    }
  }

  if (day.longDay && s.crease <= R.longDay.creaseMax && s.breathability >= R.longDay.breathableMin) {
    const stretch = f.parts.some((part) => R.longDay.stretchParts.includes(part.material));
    const up = R.longDay.lowCrease + (stretch ? R.longDay.stretch : 0);
    score += up;
    reasons.push({
      id: "LOW_CREASE_LONG_DAY",
      strength: up,
      params: day.hours === null ? { material: leadName } : { material: leadName, hours: Math.round(day.hours) },
    });
  }

  const lean = R.occasion.leanByDay[day.dayType];
  if (lean && f.lean.has(lean)) score += R.occasion.lean;
  if (R.occasion.sheenDays.includes(day.dayType) && s.sheen >= R.occasion.sheenMin) score += R.occasion.sheen;
  if (day.dayType === "casual" && R.occasion.casualLeads.includes(lead)) score += R.occasion.casualLead;

  if (likes && s.cling >= R.likes.clingMin) {
    const define: readonly string[] = likes.define;
    const covers = likes.cover.some((zone) => !define.includes(zone));
    if (likes.sit === "relaxed" || covers) score += R.likes.sitsClose;
  }

  return { score: Math.max(-1, Math.min(1, score)), reasons };
}
