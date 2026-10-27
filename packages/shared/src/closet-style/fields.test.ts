import { describe, expect, it } from "vitest";
import { materialsOf, shape, trusted } from "./fields.js";
import type { StyleAttributes, StyleItem } from "./types.js";

const attrs: StyleAttributes = {
  slot: "DRESS",
  subtype: "wrap dress",
  colours: [{ name: "sage", hex: "#9caf88", share: 1 }],
  pattern: "solid",
  materials: ["crepe"],
  warmth: { minC: 18, maxC: 34 },
  rainOk: false,
  formality: 3,
  occasions: [],
  feel: [],
  coverage: { legs: "knee", midriff: "covered" },
  silhouette: "a_line",
  fit: { waist: "defined" },
  eveningOk: true,
  rise: "high",
  confidence: { "fit.waist": 0.9, coverage: 0.5, silhouette: 0.79, rise: 0.8 },
};

const item = (over: Partial<StyleItem> = {}): StyleItem => ({
  id: "00000000-0000-4000-8000-000000000001",
  slot: "DRESS",
  materials: [],
  attributes: attrs,
  attributesSource: "MODEL",
  attributesConfirmed: {},
  ...over,
});

describe("trusted", () => {
  it("uses the path's confidence, then the group's, against 0.8", () => {
    expect(trusted(item(), "fit.waist")).toBe(true);
    expect(trusted(item(), "coverage.legs")).toBe(false);
    expect(trusted(item(), "silhouette")).toBe(false);
    expect(trusted(item(), "rise")).toBe(true);
    expect(trusted(item(), "length")).toBe(false);
  });

  it("trusts a confirmed path or group, and anything the user set", () => {
    expect(trusted(item({ attributesConfirmed: { "coverage.legs": true } }), "coverage.legs")).toBe(true);
    expect(trusted(item({ attributesConfirmed: { coverage: true } }), "coverage.midriff")).toBe(true);
    expect(trusted(item({ attributesSource: "USER" }), "silhouette")).toBe(true);
  });

  it("trusts nothing on an untagged item", () => {
    expect(trusted(item({ attributes: null }), "fit.waist")).toBe(false);
  });
});

describe("shape", () => {
  it("returns trusted values only", () => {
    expect(shape(item(), "fit.waist")).toBe("defined");
    expect(shape(item(), "rise")).toBe("high");
    expect(shape(item(), "silhouette")).toBeUndefined();
    expect(shape(item({ attributesConfirmed: { coverage: true } }), "coverage.legs")).toBe("knee");
  });

  it("returns undefined for a trusted field that isn't set", () => {
    expect(shape(item({ attributesConfirmed: { length: true } }), "length")).toBeUndefined();
  });
});

describe("materialsOf", () => {
  it("prefers the column and falls back to the tags", () => {
    expect(materialsOf(item({ materials: ["linen"] }))).toEqual(["linen"]);
    expect(materialsOf(item())).toEqual(["crepe"]);
    expect(materialsOf(item({ attributes: null }))).toEqual([]);
  });
});
