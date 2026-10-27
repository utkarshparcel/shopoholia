import type { ComposeWeekInput, ComposerItemInput, ComposerMetric } from "../closet-composer/input.js";
import type { CalendarTag, ClosetDayContext } from "../schemas/closet-context.js";
import type { ItemAttributes, ItemSlot } from "../schemas/closet-item.js";

/**
 * The week the Closet page shows (apps/web `ClosetWeek`, `ClosetBackups`, `ClosetStylist`), as
 * composer input: the closet behind it, and the seven days' plans and forecasts. Wear counts and
 * prices follow the stylist panel where it gives them.
 */

export const SITE_WEEK_START = "2026-11-09";
export const SITE_SEED = 20261109;

export const SITE_PIECES = {
  sage: 1,
  wedges: 2,
  hoops: 3,
  strawBag: 4,
  stripedMidi: 5,
  sneakers: 6,
  greyTop: 7,
  greyBottom: 8,
  runners: 9,
  redMini: 10,
  heels: 11,
  yellowMidi: 12,
  linenShirt: 13,
  shorts: 14,
  creamTop: 15,
  creamBottom: 16,
  slides: 17,
  blackKnit: 18,
  clawClip: 19,
  creamMidi: 20,
  whiteTee: 21,
  trousers: 22,
  slip: 23,
  drops: 24,
  clutch: 25,
  navyTee: 26,
} as const;
export type SitePiece = keyof typeof SITE_PIECES;

export function siteItemId(piece: SitePiece): string {
  return `a0000000-0000-4000-8000-${String(SITE_PIECES[piece]).padStart(12, "0")}`;
}

const GREY_SET = "b0000000-0000-4000-8000-000000000001";
const CREAM_SET = "b0000000-0000-4000-8000-000000000002";

const BASE: ItemAttributes = {
  v: 1,
  slot: "OTHER",
  subtype: "",
  colours: [{ name: "", hex: "#000000", share: 1 }],
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

interface Seed {
  piece: SitePiece;
  slot: ItemSlot;
  subtype: string;
  colour: [string, string];
  attrs: Partial<ItemAttributes>;
  /** Times worn, last worn, and ₹ per wear. */
  worn: [number, string | null, number];
  item: Partial<ComposerItemInput>;
}

const SEEDS: Seed[] = [
  {
    piece: "sage", slot: "DRESS", subtype: "mini", colour: ["sage", "#9caf88"],
    attrs: {
      materials: ["jersey"], warmth: { minC: 20, maxC: 34 }, occasions: ["lunch", "beach"],
      coverage: { shoulders: "bare", underarms: "bare", legs: "above_knee" },
      sleeve: "strapless", neckline: "strapless", silhouette: "bodycon", fit: { waist: "ruched", hip: "bodycon" },
      hair: { upFriendly: false, styledDown: true },
    },
    worn: [6, "2026-10-19T09:00:00Z", 310], item: {},
  },
  {
    piece: "wedges", slot: "FOOTWEAR", subtype: "wedges", colour: ["tan", "#c19a6b"],
    attrs: {
      materials: ["jute"], formality: 3, occasions: ["lunch", "brunch", "day out", "drinks"],
      footwear: { heelCm: 7, walkability: 3 },
    },
    worn: [31, "2026-11-07T10:00:00Z", 77], item: {},
  },
  {
    piece: "hoops", slot: "EARRINGS", subtype: "hoops", colour: ["gold", "#d4af37"],
    attrs: {}, worn: [58, "2026-11-08T10:00:00Z", 16], item: {},
  },
  {
    piece: "strawBag", slot: "BAG", subtype: "bag", colour: ["natural", "#d8c8a8"],
    attrs: { materials: ["straw"], occasions: ["lunch", "brunch", "day out", "weekend", "casual"] },
    worn: [22, "2026-11-05T10:00:00Z", 55], item: {},
  },
  {
    piece: "stripedMidi", slot: "DRESS", subtype: "midi", colour: ["navy", "#1f2a44"],
    attrs: {
      pattern: "stripe", materials: ["knit"], warmth: { minC: 10, maxC: 26 }, formality: 3,
      occasions: ["office", "offsite", "work"], neckline: "crew", sleeve: "long",
    },
    worn: [0, null, 6000], item: {},
  },
  {
    piece: "sneakers", slot: "FOOTWEAR", subtype: "sneakers", colour: ["white", "#f5f5f5"],
    attrs: {
      materials: ["leather"], occasions: ["office", "offsite", "walk", "day out"],
      footwear: { heelCm: 2, walkability: 5 },
    },
    worn: [25, "2026-11-06T10:00:00Z", 60], item: {},
  },
  {
    piece: "greyTop", slot: "COORD_TOP", subtype: "knit top", colour: ["grey", "#9e9e9e"],
    attrs: {
      materials: ["knit"], warmth: { minC: 10, maxC: 24 }, formality: 1, feel: ["sporty", "relaxed"],
      occasions: ["gym", "workout", "home", "lounge"],
    },
    worn: [20, "2026-11-04T10:00:00Z", 90], item: { setId: GREY_SET },
  },
  {
    piece: "greyBottom", slot: "COORD_BOTTOM", subtype: "joggers", colour: ["grey", "#9e9e9e"],
    attrs: {
      materials: ["knit"], warmth: { minC: 10, maxC: 24 }, formality: 1, feel: ["sporty", "relaxed"],
      occasions: ["gym", "workout", "home", "lounge"],
    },
    worn: [20, "2026-11-04T10:00:00Z", 90], item: { setId: GREY_SET },
  },
  {
    piece: "runners", slot: "FOOTWEAR", subtype: "running shoes", colour: ["grey", "#8a8a8a"],
    attrs: {
      materials: ["mesh"], formality: 1, feel: ["sporty"], occasions: ["gym", "workout", "walk"],
      footwear: { heelCm: 3, walkability: 5 },
    },
    worn: [30, "2026-11-04T10:00:00Z", 150], item: {},
  },
  {
    piece: "redMini", slot: "DRESS", subtype: "mini", colour: ["red", "#b3202a"],
    attrs: {
      materials: ["crepe"], warmth: { minC: 19, maxC: 28 }, formality: 3, occasions: ["dinner", "date"],
      coverage: { shoulders: "partly", underarms: "bare", legs: "above_knee" },
      sleeve: "one_shoulder", neckline: "one_shoulder", eveningOk: true,
    },
    worn: [4, "2026-06-14T19:00:00Z", 900], item: {},
  },
  {
    piece: "heels", slot: "FOOTWEAR", subtype: "heels", colour: ["gold", "#d4af37"],
    attrs: { formality: 3, occasions: ["dinner", "date"], eveningOk: true, footwear: { heelCm: 9, walkability: 2 } },
    worn: [6, "2026-06-14T19:00:00Z", 500], item: {},
  },
  {
    piece: "yellowMidi", slot: "DRESS", subtype: "midi", colour: ["yellow", "#e8c547"],
    attrs: {
      materials: ["cotton"], warmth: { minC: 16, maxC: 30 }, formality: 3,
      occasions: ["office", "drinks", "evening", "work"], neckline: "v", sleeve: "short", eveningOk: true,
    },
    worn: [5, "2026-10-23T09:00:00Z", 400], item: {},
  },
  {
    piece: "linenShirt", slot: "TOP", subtype: "shirt", colour: ["white", "#fafafa"],
    attrs: {
      materials: ["linen"], warmth: { minC: 18, maxC: 34 }, occasions: ["weekend", "brunch", "casual", "day out", "walk"],
      neckline: "collar", sleeve: "short", coverage: { shoulders: "covered", underarms: "covered" },
    },
    worn: [5, "2026-09-20T10:00:00Z", 300], item: {},
  },
  {
    piece: "shorts", slot: "BOTTOM", subtype: "shorts", colour: ["blue", "#4a6fa5"],
    attrs: {
      materials: ["denim"], warmth: { minC: 22, maxC: 38 }, occasions: ["weekend", "brunch", "walk", "casual"],
      coverage: { legs: "above_knee" },
    },
    worn: [4, "2026-09-27T10:00:00Z", 350], item: {},
  },
  {
    piece: "creamTop", slot: "COORD_TOP", subtype: "top", colour: ["cream", "#f3ead8"],
    attrs: {
      materials: ["linen"], warmth: { minC: 18, maxC: 32 }, occasions: ["weekend", "home", "casual", "lounge"],
      neckline: "crew", sleeve: "short",
    },
    worn: [3, "2026-09-15T10:00:00Z", 700], item: { setId: CREAM_SET },
  },
  {
    piece: "creamBottom", slot: "COORD_BOTTOM", subtype: "trousers", colour: ["cream", "#f3ead8"],
    attrs: { materials: ["linen"], warmth: { minC: 18, maxC: 32 }, occasions: ["weekend", "home", "casual", "lounge"] },
    worn: [3, "2026-09-15T10:00:00Z", 700], item: { setId: CREAM_SET },
  },
  {
    piece: "slides", slot: "FOOTWEAR", subtype: "slides", colour: ["black", "#111111"],
    attrs: { materials: ["leather"], occasions: ["weekend", "home", "casual"], footwear: { heelCm: 1, walkability: 3 } },
    worn: [15, "2026-11-01T10:00:00Z", 120], item: {},
  },
  {
    piece: "blackKnit", slot: "DRESS", subtype: "midi", colour: ["black", "#111111"],
    attrs: {
      materials: ["knit"], warmth: { minC: 14, maxC: 30 }, formality: 3, occasions: ["office", "dinner", "work"],
      neckline: "scoop", sleeve: "long", coverage: { shoulders: "covered", underarms: "covered", legs: "midi" },
      fit: { waist: "fitted" }, hair: { upFriendly: true, styledDown: false },
    },
    worn: [11, "2026-10-26T10:00:00Z", 200], item: {},
  },
  {
    piece: "clawClip", slot: "HAIR_ACCESSORY", subtype: "claw clip", colour: ["brown", "#6b4f3a"],
    attrs: {}, worn: [40, "2026-11-02T10:00:00Z", 9], item: {},
  },
  {
    piece: "creamMidi", slot: "DRESS", subtype: "midi", colour: ["cream", "#f3ead8"],
    attrs: {
      materials: ["linen"], warmth: { minC: 18, maxC: 34 }, occasions: ["brunch", "weekend", "casual"],
      neckline: "v", sleeve: "short", silhouette: "flowy", fit: { waist: "relaxed", hip: "relaxed" },
      coverage: { shoulders: "covered", underarms: "partly", legs: "midi" },
    },
    // The panel says worn 4×, last in August; a piece that forgotten would take Monday from the sage mini.
    worn: [14, "2026-11-01T10:00:00Z", 186], item: {},
  },
  {
    piece: "whiteTee", slot: "TOP", subtype: "tee", colour: ["white", "#ffffff"],
    attrs: {
      materials: ["cotton"], warmth: { minC: 16, maxC: 36 }, occasions: ["casual", "weekend", "home"],
      neckline: "crew", sleeve: "short", coverage: { shoulders: "covered", underarms: "covered" },
    },
    worn: [45, "2026-11-04T10:00:00Z", 13], item: {},
  },
  {
    piece: "trousers", slot: "BOTTOM", subtype: "trousers", colour: ["beige", "#d9c7a7"],
    attrs: {
      materials: ["linen"], warmth: { minC: 16, maxC: 34 }, occasions: ["office", "casual", "weekend"],
      coverage: { legs: "floor" }, fit: { waist: "defined" },
    },
    worn: [9, "2026-10-19T10:00:00Z", 233], item: {},
  },
  {
    piece: "slip", slot: "DRESS", subtype: "slip", colour: ["black", "#111111"],
    attrs: {
      materials: ["satin"], warmth: { minC: 20, maxC: 30 }, formality: 3, occasions: ["date"],
      neckline: "v", sleeve: "sleeveless", coverage: { shoulders: "bare", underarms: "bare", legs: "midi" },
      eveningOk: true,
    },
    worn: [3, "2026-05-16T19:00:00Z", 1067], item: {},
  },
  {
    piece: "drops", slot: "EARRINGS", subtype: "drops", colour: ["gold", "#d4af37"],
    attrs: { formality: 4, eveningOk: true }, worn: [5, "2026-06-14T19:00:00Z", 180], item: {},
  },
  {
    piece: "clutch", slot: "BAG", subtype: "clutch", colour: ["gold", "#d4af37"],
    attrs: { formality: 4, eveningOk: true, occasions: ["dinner", "party", "date", "evening"] },
    worn: [7, "2026-06-14T19:00:00Z", 214], item: {},
  },
  {
    piece: "navyTee", slot: "TOP", subtype: "tee", colour: ["navy", "#1f2a44"],
    attrs: { materials: ["cotton"], warmth: { minC: 16, maxC: 36 }, occasions: ["casual", "weekend", "home"] },
    worn: [30, "2026-11-07T10:00:00Z", 10], item: { laundryStatus: "IN_LAUNDRY" },
  },
];

function toItem(seed: Seed): ComposerItemInput {
  const [name, hex] = seed.colour;
  return {
    id: siteItemId(seed.piece),
    category: seed.subtype,
    colors: [],
    costMinor: seed.worn[0] === 0 ? seed.worn[2] * 100 : seed.worn[2] * seed.worn[0] * 100,
    laundryStatus: "CLEAN",
    attributesSource: "USER",
    priceSource: "USER",
    attributes: { ...BASE, slot: seed.slot, subtype: seed.subtype, colours: [{ name, hex, share: 1 }], ...seed.attrs },
    ...seed.item,
  };
}

function toMetric(seed: Seed): ComposerMetric {
  return { wardrobeItemId: siteItemId(seed.piece), wearCount: seed.worn[0], lastWornAt: seed.worn[1] };
}

function timed(kind: CalendarTag["kind"], startLocal: string, endLocal: string, outdoor: boolean): CalendarTag {
  return { startLocal, endLocal, kind, formality: null, outdoor, allDay: false };
}

function day(date: string, high: number, low: number, events: CalendarTag[]): ClosetDayContext {
  return {
    date,
    weather: { date, tempMinC: low, tempMaxC: high, rainChance: 0.1, condition: "sunny", provider: "fixture" },
    events,
  };
}

/** A fresh copy of the site's week as `composeWeek` input. */
export function siteWeekInput(): ComposeWeekInput {
  return {
    weekStart: SITE_WEEK_START,
    seed: SITE_SEED,
    days: [
      day("2026-11-09", 31, 24, [timed("LUNCH", "13:00", "14:30", false)]),
      day("2026-11-10", 21, 14, [
        { startLocal: "09:00", endLocal: "18:00", kind: "OFFSITE", formality: null, outdoor: false, allDay: true },
      ]),
      day("2026-11-11", 24, 17, [
        { startLocal: null, endLocal: null, kind: "WFH", formality: null, outdoor: false, allDay: true },
        timed("GYM", "19:00", "20:00", false),
      ]),
      day("2026-11-12", 26, 19, [timed("DINNER", "20:00", "22:30", false)]),
      day("2026-11-13", 25, 18, [timed("OFFICE", "09:30", "17:00", false), timed("DRINKS", "19:00", "21:00", false)]),
      day("2026-11-14", 29, 22, [timed("BRUNCH", "11:00", "12:30", false), timed("WALK", "13:00", "16:00", true)]),
      day("2026-11-15", 25, 18, []),
    ],
    items: SEEDS.map(toItem),
    metrics: SEEDS.map(toMetric),
  };
}
