import type {
  CoverLike,
  DayType,
  FeaturePref,
  FeatureValue,
  GapCandidate,
  GapFeature,
  GapWhyId,
  HueFamily,
  ItemSlot,
  LegCoverage,
  Length,
  LightBand,
  Neckline,
  Palette,
  PaletteLean,
  Pattern,
  ReasonParams,
  Rise,
  Silhouette,
  Sleeve,
  StyleReason,
  StyleReasonId,
} from "./types.js";

/**
 * The style engine's words (spec §2.4, §5, §6). Every line is a template over rule ids and params.
 * The garment is the subject; a part of the body appears only as where a garment sits ("at the waist").
 * `copy-lint.test.ts` checks every template through `ALL_TEMPLATE_SAMPLES()`.
 */

/** Most reasons one `styleWhy` line shows (spec §5.5). */
export const STYLE_WHY_MAX_REASONS = 2;

/** Most neutrals the palette lean line names. */
export const PALETTE_LINE_MAX_NEUTRALS = 3;

/** Words never used in copy (spec §10.3). Lint data. */
export const BANNED_WORDS: readonly string[] = [
  "flattering",
  "unflattering",
  "slimming",
  "hide",
  "flaw",
  "problem area",
  "figure",
  "apple",
  "pear",
  "hourglass",
  "rectangle",
  "inverted triangle",
  "plus-size",
  "camouflage",
];

/** Parts of the body, which copy may name only as where a garment sits (spec §10.3). Lint data. */
export const BODY_PARTS: readonly string[] = [
  "waist",
  "hip",
  "hips",
  "bust",
  "chest",
  "shoulder",
  "shoulders",
  "arm",
  "arms",
  "leg",
  "legs",
  "thigh",
  "thighs",
  "stomach",
  "tummy",
  "belly",
  "midriff",
  "body",
  "curves",
  "frame",
];

// ── Word tables ───────────────────────────────────────────────────────────────

/** What a gap calls a piece in each slot. */
export const SLOT_NOUNS: Readonly<Record<ItemSlot, string>> = {
  TOP: "top",
  BOTTOM: "bottom",
  DRESS: "dress",
  KURTA: "kurta",
  BLOUSE: "blouse",
  LAYER: "layer",
  FOOTWEAR: "pair of shoes",
  BAG: "bag",
  DUPATTA: "dupatta",
  SAREE: "saree",
  COORD_TOP: "co-ord top",
  COORD_BOTTOM: "co-ord bottom",
  JUMPSUIT: "jumpsuit",
  ACTIVE_TOP: "gym top",
  ACTIVE_BOTTOM: "gym bottom",
  EARRINGS: "pair of earrings",
  NECKLACE: "necklace",
  BANGLES: "set of bangles",
  WATCH: "watch",
  HAIR_ACCESSORY: "hair accessory",
  OTHER: "piece",
};

/** The phrase a gap's key feature adds after the piece. */
export const GAP_FEATURE_PHRASES: Readonly<Record<GapFeature, string>> = {
  defines_waist: "that ties at the waist",
  rain_ok: "for rain",
  evening: "for evenings",
  festive: "for festive days",
  layer_warm: "for cool mornings",
  covers_arms: "with elbow sleeves",
  covers_legs: "that runs to the ankle",
  covers_midriff: "covered through the middle",
  covers_back: "with a high back",
  relaxed: "with an easy fit",
  fitted: "with a close fit",
};

/** A day type in words: "office days". */
export const DAY_TYPE_WORDS: Readonly<Record<DayType, string>> = {
  work: "office",
  casual: "casual",
  evening: "evening",
  festive: "festive",
  active: "gym",
};

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Sleeves as an adjective: "Elbow sleeves." */
const SLEEVE_WORDS: Readonly<Record<Sleeve, string>> = {
  strapless: "strapless",
  one_shoulder: "one-shoulder",
  sleeveless: "sleeveless",
  cap: "cap",
  short: "short",
  elbow: "elbow",
  three_quarter: "three-quarter",
  long: "long",
};

/** Sleeves that make a "… sleeves." line; the rest have no sleeve to name. */
const SLEEVES_WITH_SLEEVES: ReadonlySet<string> = new Set<Sleeve>(["cap", "short", "elbow", "three_quarter", "long"]);

/** Sleeves as a kind of top, for learned lines. */
const SLEEVE_TOP_WORDS: Readonly<Record<Sleeve, string>> = {
  strapless: "strapless tops",
  one_shoulder: "one-shoulder tops",
  sleeveless: "sleeveless tops",
  cap: "cap-sleeve tops",
  short: "short-sleeve tops",
  elbow: "elbow-sleeve tops",
  three_quarter: "three-quarter-sleeve tops",
  long: "long-sleeve tops",
};

/** Necklines as an adjective. "other" has no name, so its line leaves the adjective out. */
const NECKLINE_WORDS: Readonly<Record<Neckline, string>> = {
  strapless: "strapless",
  off_shoulder: "off-shoulder",
  one_shoulder: "one-shoulder",
  halter: "halter",
  scoop: "scoop",
  v: "V",
  crew: "crew",
  collar: "collar",
  high: "high",
  other: "",
};

/** Hem and piece lengths as an adjective: "a knee-length hem". */
const LENGTH_WORDS: Readonly<Record<Length | LegCoverage, string>> = {
  cropped: "cropped",
  waist: "waist-length",
  hip: "hip-length",
  thigh: "thigh-length",
  above_knee: "above-knee",
  knee: "knee-length",
  midi: "midi-length",
  calf: "calf-length",
  ankle: "ankle-length",
  floor: "floor-length",
  trousers: "full-length",
};

const SILHOUETTE_WORDS: Readonly<Record<Silhouette, string>> = {
  bodycon: "bodycon",
  fitted: "close",
  a_line: "A-line",
  straight: "straight",
  relaxed: "relaxed",
  oversized: "oversized",
  flowy: "flowy",
};

const PATTERN_WORDS: Readonly<Record<Pattern, string>> = {
  solid: "solid colours",
  stripe: "stripes",
  check: "checks",
  floral: "floral prints",
  print: "prints",
  embroidered: "embroidered pieces",
  other: "patterned pieces",
};

const RISE_WORDS: Readonly<Record<Rise, string>> = { high: "high", mid: "mid", low: "low" };

const COVERS_LINES: Readonly<Record<CoverLike, string>> = {
  arms: "Covered over the arms.",
  midriff: "Covered through the middle.",
  legs: "It runs to the ankle.",
  back: "A high back.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Code-unit order, so the result never depends on the runtime's locale. */
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A param as trimmed text, or null when it is missing, blank or not a finite number. */
function text(p: ReasonParams, key: string): string | null {
  const v = p[key];
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** A param as a finite number, or null. */
function num(p: ReasonParams, key: string): number | null {
  const v = p[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** A positive whole count, or null. */
function countOf(p: ReasonParams, key: string): number | null {
  const n = num(p, key);
  return n !== null && n >= 1 ? Math.round(n) : null;
}

/** A raw value as lowercase words: "faux_leather" becomes "faux leather". */
const words = (v: string): string => v.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 to 10 in words, anything else in digits. */
function numberWords(n: number): string {
  return Number.isInteger(n) && n >= 1 && n <= NUMBER_WORDS.length ? NUMBER_WORDS[n - 1]! : String(n);
}

/** "a" or "an" before the next word, by how it sounds. */
function article(next: string): "a" | "an" {
  if (/^\d/.test(next)) return /^(?:8|1[18](?!\d))/.test(next) ? "an" : "a";
  return /^[aeiou]/i.test(next) && !/^one/i.test(next) ? "an" : "a";
}

function lookup<K extends string>(table: Readonly<Record<K, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key as K] : undefined;
}

/** "black", "black and cream", "black, cream and denim". */
function joinAnd(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** A param as lowercase words, or null. */
function wordsOf(p: ReasonParams, key: string): string | null {
  const m = text(p, key);
  return m === null ? null : words(m);
}

/** `dayTypes` as words: "work,casual" becomes "office and casual". Unknown tokens pass through. */
function dayTypesOf(p: ReasonParams): string | null {
  const raw = text(p, "dayTypes");
  if (raw === null) return null;
  const tokens = raw.split(",").map((t) => t.trim()).filter((t) => t !== "");
  const list = [...new Set(tokens.map((t) => lookup(DAY_TYPE_WORDS, t) ?? words(t)))];
  return list.length > 0 ? joinAnd(list) : null;
}

/** `slot` (an ItemSlot) as its noun, else `slotNoun` as given. */
function slotNounOf(p: ReasonParams): string {
  const slot = text(p, "slot");
  return (slot !== null ? lookup(SLOT_NOUNS, slot) : undefined) ?? text(p, "slotNoun") ?? "piece";
}

// ── Style reasons ─────────────────────────────────────────────────────────────

/**
 * One sentence per reason id. Params, all optional, with a plain fallback:
 * DEFINES_WAIST `piece`, `how`; INTEREST_ABOVE `detail`; HIGH_RISE `over`; LONG_TOP `via`, `top`;
 * COVERS `zone`, `sleeve`; EASY_FIT `material`;
 * SHOWS_SHOULDERS `neckline`; SHOWS_LEGS `length`; BREATHABLE_HEAT `materials`, `highC`;
 * LOW_CREASE_LONG_DAY `material`, `hours`; DRIES_FAST `material`, `avoided`.
 */
export const STYLE_REASON_TEMPLATES: Readonly<Record<StyleReasonId, (p: ReasonParams) => string>> = {
  DEFINES_WAIST: (p) => {
    const piece = wordsOf(p, "piece");
    const verb = text(p, "how") === "ties" ? "ties" : "is shaped";
    return piece ? `The ${piece} ${verb} at the waist.` : `It ${verb} at the waist.`;
  },
  SKIMS_WAIST: () => "It falls straight from the shoulder.",
  VOLUME_BELOW: () => "The flare at the hem balances the look.",
  INTEREST_ABOVE: (p) => {
    const detail = wordsOf(p, "detail");
    if (detail === null) return "The detail sits up top.";
    if (detail === "embroidery") return "The embroidered top carries the detail.";
    return `The detail sits at the ${detail}.`;
  },
  HIGH_RISE: (p) => {
    const over = text(p, "over");
    if (over === "kurta") return "A high rise under the kurta.";
    if (over === "top") return "A high rise under a short top.";
    return "The rise sits high, at the waist.";
  },
  LONG_TOP: (p) => {
    const top = wordsOf(p, "top");
    if (text(p, "via") === "rise") return "A mid rise, sitting below the waist.";
    if (text(p, "via") === "top" || top !== null) return `The ${top ?? "top"} falls past the hip.`;
    return "It balances top and bottom.";
  },
  COVERS: (p) => {
    const zone = text(p, "zone");
    const sleeve = text(p, "sleeve");
    if (zone === "arms" && sleeve !== null && SLEEVES_WITH_SLEEVES.has(sleeve)) {
      return `${capitalise(lookup(SLEEVE_WORDS, sleeve)!)} sleeves.`;
    }
    return (zone !== null ? lookup(COVERS_LINES, zone) : undefined) ?? "Covered where you asked.";
  },
  EASY_FIT: (p) => {
    const material = wordsOf(p, "material");
    return material ? `Loose through the body, in a soft ${material}.` : "Loose through the body.";
  },
  CLEAN_LINE: () => "A close fit in a fabric that holds its shape.",
  SHOWS_SHOULDERS: (p) => {
    const neckline = text(p, "neckline");
    const name = neckline === null ? "" : (lookup(NECKLINE_WORDS, neckline) ?? words(neckline));
    return name ? `The ${name} neckline opens at the shoulders.` : "The neckline opens at the shoulders.";
  },
  SHOWS_LEGS: (p) => {
    const length = text(p, "length");
    if (length === null) return "A shorter hem.";
    if (length === "above_knee") return "A hem above the knee.";
    const name = lookup(LENGTH_WORDS, length) ?? `${words(length)}-length`;
    return `${capitalise(article(name))} ${name} hem.`;
  },
  BREATHABLE_HEAT: (p) => {
    const materials = wordsOf(p, "materials");
    const lead = materials ? capitalise(materials) : "A breathable fabric";
    const highC = num(p, "highC");
    if (highC === null) return `${lead} for a hot day.`;
    const degrees = String(Math.round(highC) || 0);
    return `${lead} for ${article(degrees)} ${degrees}° day.`;
  },
  LOW_CREASE_LONG_DAY: (p) => {
    const material = wordsOf(p, "material");
    const hours = num(p, "hours");
    const span = hours === null || hours <= 0 ? "a long day" : hours === 1 ? "one hour" : `${numberWords(hours)} hours`;
    return `${material ? capitalise(material) : "It"} won't crease over ${span}.`;
  },
  DRIES_FAST: (p) => {
    if (wordsOf(p, "avoided") === "denim") return "Denim stays home; this dries fast.";
    const material = wordsOf(p, "material");
    return `${material ? capitalise(material) : "It"} dries fast.`;
  },
};

/**
 * The "why this works" line (spec §5.5): the `STYLE_WHY_MAX_REASONS` strongest reasons by strength,
 * ties broken by id, each id at most once, joined with a space. Null when there are none.
 */
export function styleWhy(reasons: readonly StyleReason[]): string | null {
  const ranked: { id: string; strength: number; line: string }[] = [];
  for (const r of reasons) {
    const template = lookupTemplate(r.id);
    if (!template) continue;
    ranked.push({ id: r.id, strength: Number.isFinite(r.strength) ? r.strength : -Infinity, line: template(r.params) });
  }
  ranked.sort(
    (a, b) =>
      (b.strength > a.strength ? 1 : b.strength < a.strength ? -1 : 0) ||
      byString(a.id, b.id) ||
      byString(a.line, b.line),
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of ranked) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    lines.push(r.line);
    if (lines.length === STYLE_WHY_MAX_REASONS) break;
  }
  return lines.length > 0 ? lines.join(" ") : null;
}

function lookupTemplate(id: string): ((p: ReasonParams) => string) | undefined {
  return Object.hasOwn(STYLE_REASON_TEMPLATES, id) ? STYLE_REASON_TEMPLATES[id as StyleReasonId] : undefined;
}

// ── Gaps ──────────────────────────────────────────────────────────────────────

/**
 * One line per gap kind. Params, all optional, with a plain fallback:
 * OCCASION_NO_LOOK `label`, `weekday`; SLOT_MISSING `slot` (an ItemSlot) or `slotNoun`, and `dayTypes`;
 * BLOUSE_FOR_SAREES and NEUTRAL_BOTTOM_FOR_PRINTS `count`;
 * LIKE_UNMET `feature` (a GapFeature) or `phrase`, and `dayTypes`.
 * `dayTypes` is a comma-separated list of DayType values ("work,casual").
 */
export const GAP_WHY_TEMPLATES: Readonly<Record<GapWhyId, (p: ReasonParams) => string>> = {
  OCCASION_NO_LOOK: (p) => {
    const weekday = text(p, "weekday");
    return `Nothing in your closet fits ${text(p, "label") ?? "the occasion"}${weekday ? ` on ${weekday}` : ""}.`;
  },
  SLOT_MISSING: (p) => {
    const days = dayTypesOf(p);
    return `No ${slotNounOf(p)}${days ? ` for ${days} days` : ""} yet.`;
  },
  RAIN_FOOTWEAR: () => "No shoes for rain.",
  LAYER_COOL_MORNINGS: () => "Nothing to layer on cool mornings.",
  BLOUSE_FOR_SAREES: (p) => {
    const count = countOf(p, "count");
    if (count === null) return "No blouse that goes with your sarees.";
    return `No blouse that goes with ${numberWords(count)} of your sarees.`;
  },
  EVENING_IN_COLOURS: () => "Nothing evening-ready in your colours.",
  NEUTRAL_BOTTOM_FOR_PRINTS: (p) => {
    const count = countOf(p, "count");
    if (count === null) return "No neutral bottom for your printed tops.";
    return `No neutral bottom for ${numberWords(count)} printed ${count === 1 ? "top" : "tops"}.`;
  },
  LIKE_UNMET: (p) => {
    const feature = text(p, "feature");
    const phrase =
      (feature !== null ? lookup(GAP_FEATURE_PHRASES, feature) : undefined) ??
      text(p, "phrase") ??
      "that matches what you like";
    const days = dayTypesOf(p);
    return days ? `Nothing ${phrase} for ${days} days.` : `Nothing ${phrase} yet.`;
  },
};

/** A gap's colour: the neutral's name, or the band and family ("deep teal"). A mid band goes unsaid. */
function gapColour(c: GapCandidate): string {
  const neutral = c.neutral?.trim();
  if (neutral) return words(neutral);
  return c.band && c.band !== "mid" ? `${c.band} ${c.family}` : c.family;
}

/** What a gap is, in words: "a deep teal kurta that ties at the waist", "a pair of black shoes for rain". */
export function gapWhat(c: GapCandidate): string {
  const colour = gapColour(c);
  const noun = lookup(SLOT_NOUNS, c.slot) ?? "piece";
  const counted = /^(pair|set) of (.+)$/.exec(noun);
  const thing = counted ? `a ${counted[1]} of ${colour} ${counted[2]}` : `${article(colour)} ${colour} ${noun}`;
  const phrase = c.feature !== null ? lookup(GAP_FEATURE_PHRASES, c.feature) : undefined;
  return phrase ? `${thing} ${phrase}` : thing;
}

// ── Palette ───────────────────────────────────────────────────────────────────

/**
 * The palette's lean in one line (spec §6.1): "Mostly cool and soft, with black and cream as your neutrals."
 * A mixed temperature reads "a mix of warm and cool"; a mid chroma goes unsaid. Null when there is no lean.
 */
export function paletteLeanLine(p: Palette): string | null {
  if (!p.lean) return null;
  const tone = p.lean.chroma === "mid" ? null : p.lean.chroma;
  const lead =
    p.lean.temperature === "mixed"
      ? `A mix of warm and cool${tone ? `, mostly ${tone}` : ""}`
      : `Mostly ${p.lean.temperature}${tone ? ` and ${tone}` : ""}`;
  const neutrals = p.neutrals.map(words).filter((n) => n !== "").slice(0, PALETTE_LINE_MAX_NEUTRALS);
  return neutrals.length > 0 ? `${lead}, with ${joinAnd(neutrals)} as your neutrals.` : `${lead}.`;
}

/** How sure the palette is, in words (spec §5.3). */
export function paletteConfidenceLine(p: Palette): string {
  if (p.basis === "owned") {
    const n = Number.isFinite(p.pieceCount) ? Math.max(0, Math.round(p.pieceCount)) : 0;
    if (n === 0) return "Add a few pieces and we'll read your colours.";
    return `From the ${numberWords(n)} ${n === 1 ? "piece" : "pieces"} you've added. It sharpens as you wear things.`;
  }
  if (p.confidence === "high") return "From months of what you wear.";
  if (p.confidence === "medium") return "From what you wear most.";
  return "From what you've worn so far. It sharpens as you wear more.";
}

// ── Learned preferences ───────────────────────────────────────────────────────

/** A feature value as the things it describes: "sleeve:sleeveless" becomes "sleeveless tops". */
function featureWords(feature: FeatureValue): string {
  const at = feature.indexOf(":");
  const family = feature.slice(0, at);
  const value = feature.slice(at + 1);
  switch (family) {
    case "sleeve":
      return lookup(SLEEVE_TOP_WORDS, value) ?? `${words(value)} tops`;
    case "colour":
      return `${words(value)} pieces`;
    case "silhouette":
      return `${lookup(SILHOUETTE_WORDS, value) ?? words(value)} fits`;
    case "pattern":
      return lookup(PATTERN_WORDS, value) ?? `${words(value)} prints`;
    case "neckline": {
      const name = lookup(NECKLINE_WORDS, value) ?? words(value);
      return name ? `${name} necklines` : "less common necklines";
    }
    case "length":
      return `${lookup(LENGTH_WORDS, value) ?? `${words(value)}-length`} pieces`;
    case "rise":
      return `${lookup(RISE_WORDS, value) ?? words(value)}-rise bottoms`;
    default:
      return words(value);
  }
}

/** A learned preference in plain words (spec §6.4): "You swap out sleeveless tops on office days". */
export function learnedLine(p: FeaturePref): string {
  const what = featureWords(p.feature);
  const day = lookup(DAY_TYPE_WORDS, p.dayType) ?? words(p.dayType);
  return p.value < 0 ? `You swap out ${what} on ${day} days` : `You keep ${what} for ${day} days`;
}

// ── Samples for the copy lint ─────────────────────────────────────────────────

const SAMPLE_MATERIALS = [
  "cotton", "mulmul", "khadi", "linen", "chambray", "denim", "silk", "satin", "chiffon", "georgette", "crepe",
  "organza", "net", "brocade", "banarasi", "chanderi", "viscose", "modal", "polyester", "nylon", "wool", "velvet",
  "jersey", "stretch_blend", "leather", "faux_leather",
];
const SAMPLE_FAMILIES: Readonly<Record<HueFamily, true>> = {
  red: true, orange: true, yellow: true, green: true, teal: true,
  blue: true, purple: true, pink: true, brown: true, neutral: true,
};
const SAMPLE_BANDS: readonly (LightBand | null)[] = ["light", "mid", "deep", null];
const SAMPLE_NEUTRALS = ["black", "white", "grey", "cream", "denim", "tan", "camel", "olive"];
const SAMPLE_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SAMPLE_COUNTS = [0, 1, 2, 3, 6, 9, 10, 11, 14, 25];
const SAMPLE_DAY_LISTS = [
  "work", "casual", "evening", "festive", "active", "work,casual", "work,casual,evening", "festive,evening",
];

const keysOf = <K extends string>(table: Readonly<Record<K, unknown>>): K[] => Object.keys(table) as K[];

function reasonSamples(): Record<StyleReasonId, ReasonParams[]> {
  const materials = SAMPLE_MATERIALS.map((material) => ({ material }));
  const hours: ReasonParams[] = [{}, ...[1, 2, 8, 9, 10, 11, 12, 8.5].map((h) => ({ hours: h }))];
  return {
    DEFINES_WAIST: [
      {},
      { how: "ties" },
      { how: "shaped" },
      ...["wrap", "dress", "kurta", "anarkali", "top"].flatMap((piece): ReasonParams[] => [
        { piece },
        { piece, how: "ties" },
        { piece, how: "shaped" },
      ]),
    ],
    SKIMS_WAIST: [{}, { piece: "kurta" }],
    VOLUME_BELOW: [{}, { piece: "skirt" }],
    INTEREST_ABOVE: [{}, { detail: "neckline" }, { detail: "sleeves" }, { detail: "embroidery" }],
    HIGH_RISE: [{}, { over: "top" }, { over: "kurta" }],
    LONG_TOP: [
      {},
      { via: "rise" },
      { via: "top" },
      ...["kurta", "top", "tunic"].flatMap((top): ReasonParams[] => [{ top }, { via: "top", top }]),
    ],
    COVERS: [
      {},
      ...keysOf(COVERS_LINES).map((zone) => ({ zone })),
      ...keysOf(SLEEVE_WORDS).map((sleeve) => ({ zone: "arms", sleeve })),
      { zone: "shoulders" },
    ],
    EASY_FIT: [{}, ...materials],
    CLEAN_LINE: [{}, ...materials],
    SHOWS_SHOULDERS: [{}, ...keysOf(NECKLINE_WORDS).map((neckline) => ({ neckline })), { neckline: "boat" }],
    SHOWS_LEGS: [{}, ...keysOf(LENGTH_WORDS).map((length) => ({ length })), { length: "mini" }],
    BREATHABLE_HEAT: [
      {},
      { highC: 34 },
      { materials: "Linen and cotton" },
      ...["Linen and cotton", "Linen", "Cotton and khadi", "Mulmul"].flatMap((m) =>
        [30, 34, 38, 41, 45].map((highC) => ({ materials: m, highC })),
      ),
      { materials: "Cotton", highC: 18 },
      { materials: "Cotton", highC: 8 },
    ],
    LOW_CREASE_LONG_DAY: [...hours, ...SAMPLE_MATERIALS.flatMap((material) => hours.map((h) => ({ material, ...h })))],
    DRIES_FAST: [{}, { avoided: "denim" }, ...materials],
  };
}

function gapWhySamples(): Record<GapWhyId, ReasonParams[]> {
  const counts = [{}, ...SAMPLE_COUNTS.map((count) => ({ count }))];
  const withDays = (base: ReasonParams[]): ReasonParams[] =>
    base.flatMap((b) => [b, ...SAMPLE_DAY_LISTS.map((dayTypes) => ({ ...b, dayTypes }))]);
  return {
    OCCASION_NO_LOOK: [
      {},
      ...["the sangeet", "Diwali dinner", "the office party"].flatMap((label) => [
        { label },
        ...SAMPLE_WEEKDAYS.map((weekday) => ({ label, weekday })),
      ]),
    ],
    SLOT_MISSING: withDays([{}, ...keysOf(SLOT_NOUNS).map((slot) => ({ slot })), { slotNoun: "bag" }]),
    RAIN_FOOTWEAR: [{}],
    LAYER_COOL_MORNINGS: [{}],
    BLOUSE_FOR_SAREES: counts,
    EVENING_IN_COLOURS: [{}],
    NEUTRAL_BOTTOM_FOR_PRINTS: counts,
    LIKE_UNMET: withDays([
      {},
      ...keysOf(GAP_FEATURE_PHRASES).map((feature) => ({ feature })),
      { phrase: "with a high back" },
    ]),
  };
}

function gapWhatSamples(): string[] {
  const colours: Pick<GapCandidate, "family" | "band" | "neutral">[] = [
    ...SAMPLE_NEUTRALS.map((neutral) => ({ family: "neutral" as const, band: null, neutral })),
    ...keysOf(SAMPLE_FAMILIES).flatMap((family) => SAMPLE_BANDS.map((band) => ({ family, band, neutral: null }))),
  ];
  const features: (GapFeature | null)[] = [null, ...keysOf(GAP_FEATURE_PHRASES)];
  return keysOf(SLOT_NOUNS).flatMap((slot) =>
    colours.flatMap((colour) => features.map((feature) => gapWhat({ slot, ...colour, feature }))),
  );
}

function paletteSamples(): string[] {
  const temperatures: PaletteLean["temperature"][] = ["warm", "cool", "mixed"];
  const chromas: PaletteLean["chroma"][] = ["soft", "mid", "bright"];
  const depths: PaletteLean["depth"][] = ["light", "mid", "deep"];
  const neutralSets = [[], ["black"], ["black", "cream"], ["black", "white", "denim"], SAMPLE_NEUTRALS];
  const base: Palette = { swatches: [], lean: null, neutrals: [], confidence: "low", basis: "owned", pieceCount: 0 };
  const lines: string[] = [];
  for (const temperature of temperatures) {
    for (const chroma of chromas) {
      for (const depth of depths) {
        for (const neutrals of neutralSets) {
          lines.push(paletteLeanLine({ ...base, lean: { temperature, chroma, depth }, neutrals })!);
        }
      }
    }
  }
  for (const pieceCount of SAMPLE_COUNTS) lines.push(paletteConfidenceLine({ ...base, pieceCount }));
  for (const confidence of ["low", "medium", "high"] as const) {
    lines.push(paletteConfidenceLine({ ...base, basis: "worn", confidence, pieceCount: 40 }));
  }
  return lines;
}

function learnedSamples(): string[] {
  const features: FeatureValue[] = [
    ...keysOf(SAMPLE_FAMILIES).map((v) => `colour:${v}` as const),
    ...keysOf(SILHOUETTE_WORDS).map((v) => `silhouette:${v}` as const),
    ...keysOf(SLEEVE_TOP_WORDS).map((v) => `sleeve:${v}` as const),
    ...keysOf(NECKLINE_WORDS).map((v) => `neckline:${v}` as const),
    ...keysOf(LENGTH_WORDS).map((v) => `length:${v}` as const),
    ...keysOf(RISE_WORDS).map((v) => `rise:${v}` as const),
    ...keysOf(PATTERN_WORDS).map((v) => `pattern:${v}` as const),
    ...SAMPLE_MATERIALS.map((v) => `fabric:${v}` as const),
    "colour:sea_green",
    "neckline:boat",
  ];
  return keysOf(DAY_TYPE_WORDS).flatMap((dayType) =>
    features.flatMap((feature) => [-0.6, 0.6].map((value) => learnedLine({ dayType, feature, value, support: 3 }))),
  );
}

/** Every template rendered with sample params, every branch included, for the copy lint. Deterministic, no repeats. */
export function ALL_TEMPLATE_SAMPLES(): string[] {
  const reasons = reasonSamples();
  const gapWhys = gapWhySamples();
  const lines = [
    ...keysOf(reasons).flatMap((id) => reasons[id].map((p) => STYLE_REASON_TEMPLATES[id](p))),
    ...keysOf(gapWhys).flatMap((id) => gapWhys[id].map((p) => GAP_WHY_TEMPLATES[id](p))),
    ...gapWhatSamples(),
    ...paletteSamples(),
    ...learnedSamples(),
  ];
  return [...new Set(lines)];
}
