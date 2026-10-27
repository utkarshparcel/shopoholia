import { describe, expect, it } from "vitest";
import {
  FAMILY_RING,
  NAME_NEUTRALS,
  RULE_NEUTRALS,
  harmony,
  harmonyColour,
  hexToOklch,
  hueFamily,
  isNeutral,
  lightBand,
  neutralName,
  normalizeHex,
  oklabDistance,
  ringNeighbours,
  sameWarmth,
  temperature,
  type HarmonyPiece,
} from "./colour.js";
import type { Oklch, StyleColour } from "./types.js";

const col = (name: string, hex: string, share = 1): StyleColour => ({ name, hex, share });

const ok = (hex: string): Oklch => {
  const o = hexToOklch(hex);
  if (o === null) throw new Error(`bad test hex ${hex}`);
  return o;
};

const piece = (
  main: StyleColour,
  opts: { colours?: readonly StyleColour[]; busy?: boolean; accent?: boolean } = {},
): HarmonyPiece => ({
  main: harmonyColour(main),
  colours: (opts.colours ?? [main]).map(harmonyColour),
  busy: opts.busy ?? false,
  accent: opts.accent ?? false,
});

describe("hexToOklch", () => {
  it("hexToOklch matches reference values", () => {
    const near = (hex: string, l: number, c: number, h?: number) => {
      const o = ok(hex);
      expect(Math.abs(o.l - l)).toBeLessThanOrEqual(0.003);
      expect(Math.abs(o.c - c)).toBeLessThanOrEqual(0.003);
      if (h !== undefined) expect(Math.abs(o.h - h)).toBeLessThanOrEqual(0.6);
    };
    near("#ffffff", 1, 0);
    expect(ok("#000000").l).toBeCloseTo(0, 6);
    near("#ff0000", 0.628, 0.2577, 29.23);
    near("#00ff00", 0.8664, 0.2948, 142.5);
    near("#0000ff", 0.452, 0.3132, 264.05);
    expect(hexToOklch("#abc")).toEqual(hexToOklch("#aabbcc"));
    expect(hexToOklch("zzz")).toBeNull();
    expect(hexToOklch("")).toBeNull();
    expect(hexToOklch("#12345")).toBeNull();
  });

  it("accepts any case, with or without #, and rejects everything else", () => {
    expect(hexToOklch("FF0000")).toEqual(hexToOklch("#ff0000"));
    expect(hexToOklch("#AbC")).toEqual(hexToOklch("aabbcc"));
    for (const bad of ["#ggg", "#ff00001", "##fff", " #fff", "#ff 000", "rgb(0,0,0)", "#ffff"]) {
      expect(hexToOklch(bad)).toBeNull();
    }
    expect(hexToOklch(undefined as unknown as string)).toBeNull();
    expect(hexToOklch(255 as unknown as string)).toBeNull();
  });

  it("keeps h in [0, 360) and 0 for black", () => {
    expect(ok("#000000")).toEqual({ l: 0, c: 0, h: 0 });
    for (const hex of ["#ff0000", "#ff1493", "#0000ff", "#ff69b4", "#008080"]) {
      const { h } = ok(hex);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("normalizeHex expands and lowercases", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex("#A1b2C3")).toBe("#a1b2c3");
    expect(normalizeHex("nope")).toBeNull();
  });
});

describe("oklabDistance", () => {
  it("is zero for the same colour, symmetric, and 1 from black to white", () => {
    const red = ok("#ff0000");
    const pink = ok("#ff1493");
    expect(oklabDistance(red, red)).toBe(0);
    expect(oklabDistance(red, pink)).toBeCloseTo(oklabDistance(pink, red), 12);
    expect(oklabDistance(ok("#000000"), ok("#ffffff"))).toBeCloseTo(1, 3);
    expect(oklabDistance({ l: 0.5, c: 0.1, h: 0 }, { l: 0.5, c: 0.1, h: 180 })).toBeCloseTo(0.2, 12);
  });
});

describe("hueFamily and lightBand", () => {
  it("hueFamily bins named colours", () => {
    const table: [string, string][] = [
      ["#8b4513", "brown"],
      ["#ffa500", "orange"],
      ["#ffd700", "yellow"],
      ["#008000", "green"],
      ["#008080", "teal"],
      ["#000080", "blue"],
      ["#800080", "purple"],
      ["#ff00ff", "pink"],
      ["#ff69b4", "pink"],
      ["#800000", "red"],
      ["#808080", "neutral"],
    ];
    for (const [hex, family] of table) expect([hex, hueFamily(ok(hex))]).toEqual([hex, family]);
  });

  it("applies the family boundaries in order", () => {
    const f = (l: number, c: number, h: number) => hueFamily({ l, c, h });
    expect(f(0.5, 0.0399, 30)).toBe("neutral");
    expect(f(0.5, 0.12, 20)).toBe("brown");
    expect(f(0.5, 0.12, 99.9)).toBe("brown");
    expect(f(0.55, 0.12, 30)).toBe("red");
    expect(f(0.5, 0.13, 30)).toBe("red");
    expect(f(0.5, 0.12, 100)).toBe("yellow");
    expect(f(0.5, 0.12, 19.9)).toBe("red");
    expect(f(0.5, 0.2, 9.9)).toBe("pink");
    expect(f(0.49, 0.2, 9.9)).toBe("purple");
    expect(f(0.5, 0.2, 320)).toBe("pink");
    expect(f(0.49, 0.2, 320)).toBe("purple");
    expect(f(0.7, 0.2, 319.9)).toBe("purple");
    expect(f(0.7, 0.2, 10)).toBe("red");
    expect(f(0.7, 0.2, 45)).toBe("orange");
    expect(f(0.7, 0.2, 80)).toBe("yellow");
    expect(f(0.7, 0.2, 115)).toBe("green");
    expect(f(0.7, 0.2, 175)).toBe("teal");
    expect(f(0.7, 0.2, 230)).toBe("blue");
    expect(f(0.7, 0.2, 285)).toBe("purple");
    expect(f(0.7, 0.2, Number.NaN)).toBe("neutral");
  });

  it("lightBand splits at 0.75 and 0.45", () => {
    expect(lightBand({ l: 0.75, c: 0, h: 0 })).toBe("light");
    expect(lightBand({ l: 0.7499, c: 0, h: 0 })).toBe("mid");
    expect(lightBand({ l: 0.45, c: 0, h: 0 })).toBe("mid");
    expect(lightBand({ l: 0.4499, c: 0, h: 0 })).toBe("deep");
  });

  it("the ring wraps, and brown neighbours red and orange", () => {
    expect(FAMILY_RING).toEqual(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]);
    expect([...ringNeighbours("red")].sort()).toEqual(["brown", "orange", "pink"]);
    expect([...ringNeighbours("pink")].sort()).toEqual(["purple", "red"]);
    expect([...ringNeighbours("orange")].sort()).toEqual(["brown", "red", "yellow"]);
    expect([...ringNeighbours("brown")].sort()).toEqual(["orange", "red"]);
    expect(ringNeighbours("teal")).toEqual(["green", "blue"]);
    expect(ringNeighbours("neutral")).toEqual([]);
  });
});

describe("neutrals", () => {
  it("isNeutral by chroma and by rule name", () => {
    expect(isNeutral(col("olive", "#808000"))).toBe(true);
    expect(isNeutral(col("denim blue", "#1560bd"))).toBe(true);
    expect(isNeutral(col("navy", "#000080"))).toBe(false);
    expect(isNeutral(col("black", "bad-hex"))).toBe(true);
    // "bad" is itself a valid #rgb (#bbaadd, a lavender with chroma 0.074), so the hex leads and the name doesn't count.
    expect(hexToOklch("bad")).toEqual(hexToOklch("#bbaadd"));
    expect(isNeutral(col("black", "bad"))).toBe(false);
  });

  it("reads whole words only, in any case", () => {
    expect(isNeutral(col("tangerine", "#f28500"))).toBe(false);
    expect(isNeutral(col("Light Tan", "#e0a060"))).toBe(true);
    expect(isNeutral(col("Off-White", "nope"))).toBe(true);
    expect(isNeutral(col("denim-blue", "#1560bd"))).toBe(true);
    expect(isNeutral(col("grey", "#ff0000"))).toBe(false);
    expect(isNeutral(col("red", ""))).toBe(false);
    expect(isNeutral(col("slate", "#708090"))).toBe(true);
    expect(NAME_NEUTRALS).toEqual(expect.arrayContaining([...RULE_NEUTRALS, "black", "white", "off-white"]));
  });

  it("neutralName gives the rule name, then goes by lightness", () => {
    expect(neutralName(col("denim blue", "#1560bd"))).toBe("denim");
    expect(neutralName(col("Olive", "#808000"))).toBe("olive");
    expect(neutralName(col("cream", "#fffdd0"))).toBe("cream");
    expect(neutralName(col("jet", "#111111"))).toBe("black");
    expect(neutralName(col("stone", "#808080"))).toBe("grey");
    expect(neutralName(col("snow", "#ffffff"))).toBe("white");
    expect(neutralName({ name: "", hex: "#222222", share: 1 })).toBe("black");
    expect(neutralName({ name: "", hex: "#333333", share: 1 })).toBe("grey");
    expect(neutralName({ name: "", hex: "#dddddd", share: 1 })).toBe("grey");
    expect(neutralName({ name: "", hex: "#e5e5e5", share: 1 })).toBe("white");
    expect(neutralName(col("navy", "#000080"))).toBeNull();
  });

  it("neutralName maps names when the hex is invalid", () => {
    expect(neutralName(col("black", "bad-hex"))).toBe("black");
    expect(neutralName(col("Off-White", ""))).toBe("white");
    expect(neutralName(col("ivory", "#12"))).toBe("white");
    expect(neutralName(col("beige", "#12"))).toBe("white");
    expect(neutralName(col("charcoal", "x"))).toBe("grey");
    expect(neutralName(col("gray", "x"))).toBe("grey");
    expect(neutralName(col("camel", "x"))).toBe("camel");
    expect(neutralName(col("navy", "x"))).toBeNull();
  });
});

describe("temperature", () => {
  it("is neutral below 0.04 chroma, warm from 345 through 115, cool otherwise", () => {
    expect(temperature({ l: 0.5, c: 0.039, h: 30 })).toBe("neutral");
    expect(temperature({ l: 0.5, c: 0.1, h: 345 })).toBe("warm");
    expect(temperature({ l: 0.5, c: 0.1, h: 344.9 })).toBe("cool");
    expect(temperature({ l: 0.5, c: 0.1, h: 0 })).toBe("warm");
    expect(temperature({ l: 0.5, c: 0.1, h: 114.9 })).toBe("warm");
    expect(temperature({ l: 0.5, c: 0.1, h: 115 })).toBe("cool");
    expect(temperature(ok("#ff0000"))).toBe("warm");
    expect(temperature(ok("#0000ff"))).toBe("cool");
  });

  it("sameWarmth needs two chromatic colours of one temperature", () => {
    expect(sameWarmth(ok("#ff0000"), ok("#ffa500"))).toBe(true);
    expect(sameWarmth(ok("#000080"), ok("#008080"))).toBe(true);
    expect(sameWarmth(ok("#bcb88a"), ok("#d2b48c"))).toBe(true);
    expect(sameWarmth(ok("#ff0000"), ok("#0000ff"))).toBe(false);
    expect(sameWarmth(ok("#9caf88"), ok("#d2b48c"))).toBe(false);
    expect(sameWarmth(ok("#808080"), ok("#808080"))).toBe(false);
    expect(sameWarmth(ok("#808080"), ok("#ff0000"))).toBe(false);
  });
});

describe("harmony", () => {
  const red = col("red", "#ff0000");
  const orange = col("orange", "#ffa500");
  const green = col("green", "#008000");
  const blue = col("blue", "#0000ff");
  const navy = col("navy", "#000080");
  const royal = col("royal blue", "#1560bd");
  const teal = col("teal", "#008080");
  const grey = col("grey", "#808080");
  const white = col("white", "#ffffff");

  it("harmony rule table", () => {
    // 1. Both busy.
    expect(harmony(piece(red, { busy: true }), piece(blue, { busy: true }), false)).toBe(-0.4);
    // 2. A solid picks up a colour of the print, even a minor one.
    const print = piece(white, { busy: true, colours: [white, col("navy", "#000080", 0.3)] });
    expect(harmony(print, piece(navy), false)).toBe(0.7);
    expect(harmony(piece(navy), print, false)).toBe(0.7);
    // 3. Either main colour is neutral.
    expect(harmony(piece(grey), piece(red), false)).toBe(0.6);
    expect(harmony(piece(red), piece(col("denim", "#1560bd")), false)).toBe(0.6);
    // 4. Same hue: tonal with lightness contrast, else +0.4.
    expect(harmony(piece(navy), piece(blue), false)).toBe(0.8);
    expect(harmony(piece(blue), piece(royal), false)).toBe(0.4);
    // 5. Neighbouring hues.
    expect(harmony(piece(red), piece(orange), false)).toBe(0.6);
    // 6. Opposite hues with a muted side, or an accent.
    expect(harmony(piece(teal), piece(red), false)).toBe(0.5);
    expect(harmony(piece(blue), piece(orange, { accent: true }), false)).toBe(0.5);
    // 7. Two strong colours 60–140° apart.
    expect(harmony(piece(green), piece(blue), false)).toBe(-0.6);
    const pink = piece(col("pink", "#ff1493"));
    const marigold = piece(col("orange", "#ff8c00"));
    expect(harmony(pink, marigold, false)).toBe(-0.6);
    expect(harmony(pink, marigold, true)).toBe(0.2);
    // 8. Anything else.
    expect(harmony(piece(blue), piece(orange), false)).toBe(0);
  });

  it("is symmetric over the rule table", () => {
    const all = [red, orange, green, blue, navy, royal, teal, grey, white, col("pink", "#ff1493")];
    for (const a of all) {
      for (const b of all) {
        for (const festive of [false, true]) {
          expect(harmony(piece(a), piece(b), festive)).toBe(harmony(piece(b), piece(a), festive));
        }
      }
    }
  });

  it("a one-sided print that matches nothing falls through to the main colours", () => {
    const print = piece(red, { busy: true, colours: [red, col("yellow", "#ffd700", 0.2)] });
    expect(harmony(print, piece(orange), false)).toBe(0.6);
    expect(harmony(print, piece(grey), false)).toBe(0.6);
  });

  it("harmony falls back to names when a hex is missing or malformed", () => {
    expect(harmony(piece(col("navy blue", "")), piece(col("sky blue", "#87ceeb")), false)).toBe(0.4);
    expect(harmony(piece(col("Navy Blue", "#12345")), piece(col("blue", "bad-hex")), false)).toBe(0.4);
    expect(harmony(piece(col("black", "nope")), piece(red), false)).toBe(0.6);
    expect(harmony(piece(red), piece(col("cream", "")), false)).toBe(0.6);
    expect(harmony(piece(col("black", "")), piece(col("black", "")), false)).toBe(0.6);
    expect(harmony(piece(col("rust", "")), piece(teal), false)).toBe(0);
    expect(harmony(piece(col("rust", "#zzzzzz")), piece(col("green", "#zzzzzz")), true)).toBe(0);
    // Both busy still wins without a hex.
    expect(harmony(piece(col("rust", ""), { busy: true }), piece(col("rust", ""), { busy: true }), false)).toBe(-0.4);
    // A print whose main hex is bad still matches through another colour.
    const print = piece(col("paisley", "bad-hex"), { busy: true, colours: [col("paisley", "bad-hex"), navy] });
    expect(harmony(print, piece(navy), false)).toBe(0.7);
  });

  it("an empty colours list never throws", () => {
    const empty: HarmonyPiece = { main: harmonyColour(col("", "")), colours: [], busy: false, accent: false };
    const emptyPrint: HarmonyPiece = { ...empty, busy: true };
    expect(harmony(empty, empty, false)).toBe(0);
    expect(harmony(empty, piece(red), true)).toBe(0);
    expect(harmony(emptyPrint, piece(red), false)).toBe(0);
    expect(harmony(piece(red), emptyPrint, false)).toBe(0);
    expect(harmony(emptyPrint, piece(grey), false)).toBe(0.6);
  });

  it("harmonyColour handles any input", () => {
    const junk: unknown[] = [null, undefined, {}, { name: 5, hex: null, share: "x" }, { name: "black" }, { hex: "#fff" }, "red", 7];
    for (const j of junk) {
      const h = harmonyColour(j as StyleColour);
      expect(typeof h.colour.name).toBe("string");
      expect(typeof h.colour.hex).toBe("string");
      expect(Number.isFinite(h.colour.share)).toBe(true);
      expect(typeof h.neutral).toBe("boolean");
      expect(() => harmony({ main: h, colours: [h], busy: true, accent: false }, piece(red), false)).not.toThrow();
    }
    expect(harmonyColour({ name: "black" } as StyleColour)).toEqual({
      colour: { name: "black", hex: "", share: 0 },
      oklch: null,
      neutral: true,
    });
    expect(harmonyColour({ hex: "#fff" } as StyleColour).neutral).toBe(true);
    expect(harmonyColour(col("red", "#ff0000", 0.6))).toEqual({
      colour: { name: "red", hex: "#ff0000", share: 0.6 },
      oklch: hexToOklch("#ff0000"),
      neutral: false,
    });
    expect(isNeutral(null as unknown as StyleColour)).toBe(false);
    expect(neutralName(undefined as unknown as StyleColour)).toBeNull();
  });
});
