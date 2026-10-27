import { describe, expect, it } from "vitest";
import {
  ACTION_VALUE,
  BODY_LINKED_FAMILIES,
  LEARN,
  activePreferences,
  dropBodyLinked,
  learnedScore,
  prefKey,
  resetPreference,
  updatePreferences,
} from "./learn.js";
import type { StyleAction, StyleSignal } from "./learn.js";
import type { DayType, FeaturePref, FeatureValue } from "./types.js";

const pref = (dayType: DayType, feature: FeatureValue, value: number, support: number): FeaturePref => ({
  dayType,
  feature,
  value,
  support,
});

const signal = (action: StyleAction, dayType: DayType, ...features: FeatureValue[]): StyleSignal => ({
  action,
  dayType,
  features,
});

/** The same pref, with the value matched to 10 places. */
const near = (dayType: DayType, feature: FeatureValue, value: number, support: number) => ({
  dayType,
  feature,
  value: expect.closeTo(value, 10),
  support,
});

const repeat = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make);

/** A small seeded generator (an LCG), so the property tests repeat exactly. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const DAY_TYPES: readonly DayType[] = ["work", "casual", "evening", "festive", "active"];
const ACTIONS = Object.keys(ACTION_VALUE) as StyleAction[];
const FEATURES: readonly FeatureValue[] = [
  "sleeve:sleeveless",
  "sleeve:long",
  "colour:pink",
  "colour:teal",
  "fabric:linen",
  "fabric:satin",
  "pattern:floral",
  "neckline:v",
  "silhouette:a_line",
  "length:knee",
  "rise:high",
];

function randomWeek(next: () => number, size: number): StyleSignal[] {
  return repeat(size, () => {
    const count = 1 + Math.floor(next() * 3);
    return {
      action: ACTIONS[Math.floor(next() * ACTIONS.length)]!,
      dayType: DAY_TYPES[Math.floor(next() * DAY_TYPES.length)]!,
      features: repeat(count, () => FEATURES[Math.floor(next() * FEATURES.length)]!),
    };
  });
}

function randomPrefs(next: () => number, size: number): FeaturePref[] {
  const byKey = new Map<string, FeaturePref>();
  for (let i = 0; i < size; i += 1) {
    const p = pref(
      DAY_TYPES[Math.floor(next() * DAY_TYPES.length)]!,
      `colour:c${Math.floor(next() * 400)}`,
      Math.round((next() * 2 - 1) * 1000) / 1000,
      Math.floor(next() * 8),
    );
    if (Math.abs(p.value) >= 0.01) byKey.set(prefKey(p), p);
  }
  return [...byKey.values()];
}

describe("constants", () => {
  it("hold the plan's starting values", () => {
    expect(ACTION_VALUE).toEqual({
      locked: 1,
      worn: 1,
      swapped_in: 1,
      kept: 0.25,
      swapped_out: -1,
      skipped: -0.5,
      gap_dismissed: -0.5,
    });
    expect(LEARN).toEqual({ decay: 0.7, minSupport: 3, cap: 200, learnedWeight: 0.3, learnedClamp: 0.5 });
    expect([...BODY_LINKED_FAMILIES].sort()).toEqual(["length", "rise", "silhouette"]);
  });

  it("prefKey joins the day type and the feature", () => {
    expect(prefKey({ dayType: "work", feature: "sleeve:sleeveless" })).toBe("work|sleeve:sleeveless");
  });
});

describe("updatePreferences", () => {
  it("updatePreferences decays and averages", () => {
    const prev = [pref("work", "sleeve:sleeveless", 0.5, 4)];
    const week = [signal("swapped_out", "work", "sleeve:sleeveless"), signal("swapped_out", "work", "sleeve:sleeveless")];
    const [next] = updatePreferences(prev, week);
    expect(next!.value).toBeCloseTo(0.05, 10);
    // The sign held and neither signal agreed with it, so support carries over unchanged.
    expect(next!.support).toBe(4);
  });

  it("starts a new key from this week's mean", () => {
    const week = [signal("locked", "work", "colour:pink"), signal("kept", "work", "colour:pink")];
    expect(updatePreferences([], week)).toEqual([near("work", "colour:pink", 0.1875, 2)]);
  });

  it("decays a key without signals and drops it below 0.01", () => {
    const prev = [
      pref("work", "colour:pink", 0.5, 3),
      pref("work", "colour:teal", 0.014, 6),
      pref("work", "colour:blue", -0.0143, 6),
    ];
    const next = updatePreferences(prev, []);
    expect(next.map((p) => p.feature)).toEqual(["colour:blue", "colour:pink"]);
    expect(next[0]!.value).toBeCloseTo(-0.01001, 10);
    expect(next[1]!.value).toBeCloseTo(0.35, 10);
    expect(next[1]!.support).toBe(3);
  });

  it("drops a key whose signals cancel out", () => {
    const week = [signal("swapped_in", "casual", "fabric:linen"), signal("swapped_out", "casual", "fabric:linen")];
    expect(updatePreferences([], week)).toEqual([]);
  });

  it("support restarts when the sign flips", () => {
    const prev = [pref("work", "sleeve:sleeveless", 0.1, 5)];
    const week = repeat(3, () => signal("swapped_out", "work", "sleeve:sleeveless"));
    const [next] = updatePreferences(prev, week);
    expect(next!.value).toBeCloseTo(-0.23, 10);
    expect(next!.support).toBe(3);
  });

  it("support adds up while the sign holds", () => {
    const prev = [pref("evening", "fabric:satin", 0.5, 2)];
    const week = [
      signal("locked", "evening", "fabric:satin"),
      signal("worn", "evening", "fabric:satin"),
      signal("skipped", "evening", "fabric:satin"),
    ];
    const [next] = updatePreferences(prev, week);
    expect(next!.value).toBeCloseTo(0.5 * 0.7 + 0.5 * 0.3, 10);
    expect(next!.support).toBe(4);
  });

  it("keeps values within [-1, 1], even from stored values outside it", () => {
    const prev = [pref("work", "colour:pink", 1, 9), pref("work", "colour:teal", -3, 2)];
    const week = repeat(4, () => signal("locked", "work", "colour:pink"));
    const next = updatePreferences(prev, week);
    expect(next[0]!.value).toBe(1);
    expect(next[0]!.support).toBe(13);
    expect(next[1]!.value).toBeCloseTo(-0.7, 10);
  });

  it("ignores stored values that aren't numbers, and repairs stored support", () => {
    const prev = [
      pref("work", "colour:pink", Number.NaN, 4),
      pref("work", "colour:teal", 0.5, Number.NaN),
      pref("work", "colour:blue", 0.5, -2),
    ];
    const next = updatePreferences(prev, []);
    expect(next.map((p) => [p.feature, p.support])).toEqual([
      ["colour:blue", 0],
      ["colour:teal", 0],
    ]);
  });

  it("keeps the first of two stored prefs with the same key", () => {
    const prev = [pref("work", "colour:pink", 0.5, 4), pref("work", "colour:pink", -0.9, 9)];
    const next = updatePreferences(prev, []);
    expect(next).toHaveLength(1);
    expect(next[0]!.value).toBeCloseTo(0.35, 10);
  });

  it("counts a signal once per feature, under its own day type", () => {
    const week = [
      signal("locked", "work", "sleeve:long", "sleeve:long"),
      signal("swapped_out", "casual", "sleeve:long"),
    ];
    expect(updatePreferences([], week)).toEqual([
      near("casual", "sleeve:long", -0.3, 1),
      near("work", "sleeve:long", 0.3, 1),
    ]);
  });

  it("ignores an action it doesn't know", () => {
    const unknown = (action: string) => ({ action, dayType: "work", features: ["colour:pink"] }) as unknown as StyleSignal;
    expect(updatePreferences([], [unknown("poll_vote"), unknown("toString")])).toEqual([]);
  });

  it("leaves its inputs unchanged", () => {
    const prev = Object.freeze([Object.freeze(pref("work", "colour:pink", 0.5, 4))]);
    const week = Object.freeze([Object.freeze(signal("locked", "work", "colour:pink"))]);
    const next = updatePreferences(prev, week);
    expect(prev[0]).toEqual(pref("work", "colour:pink", 0.5, 4));
    expect(next[0]).not.toBe(prev[0]);
  });

  it("cap keeps the strongest 200", () => {
    const prev = repeat(250, () => null).map((_, i) =>
      pref("work", `colour:c${String(i).padStart(3, "0")}`, 0.5, i + 1),
    );
    const next = updatePreferences(prev, []);
    expect(next).toHaveLength(LEARN.cap);
    expect(Math.min(...next.map((p) => p.support))).toBe(51);
    const keys = next.map(prefKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("cap breaks ties by key", () => {
    const prev = repeat(250, () => null).map((_, i) =>
      pref("work", `colour:c${String(249 - i).padStart(3, "0")}`, 0.5, 3),
    );
    const next = updatePreferences(prev, []);
    expect(next).toHaveLength(200);
    expect(next[0]!.feature).toBe("colour:c000");
    expect(next[199]!.feature).toBe("colour:c199");
  });

  it("deterministic order", () => {
    const next = lcg(7);
    const prev = randomPrefs(next, 260);
    const week = randomWeek(next, 120);
    const a = updatePreferences(prev, week);
    const b = updatePreferences([...prev].reverse(), [...week].reverse());
    expect(b).toEqual(a);
    expect(updatePreferences(prev, week)).toEqual(a);
    const keys = a.map(prefKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("stays bounded over many seeded weeks", () => {
    const next = lcg(20261026);
    const broken: string[] = [];
    for (let run = 0; run < 25; run += 1) {
      let prefs = randomPrefs(next, Math.floor(next() * 300));
      for (let week = 0; week < 8; week += 1) {
        prefs = updatePreferences(prefs, randomWeek(next, Math.floor(next() * 60)));
        const keys = prefs.map(prefKey);
        if (prefs.length > LEARN.cap) broken.push(`${run}/${week}: ${prefs.length} prefs`);
        if (new Set(keys).size !== keys.length) broken.push(`${run}/${week}: repeated keys`);
        if (keys.some((k, i) => i > 0 && keys[i - 1]! >= k)) broken.push(`${run}/${week}: not sorted by key`);
        for (const p of prefs) {
          const size = Math.abs(p.value);
          if (!(size <= 1 && size >= 0.01)) broken.push(`${run}/${week}: ${prefKey(p)} value ${p.value}`);
          if (!(Number.isInteger(p.support) && p.support >= 0)) broken.push(`${run}/${week}: ${prefKey(p)} support ${p.support}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("activePreferences", () => {
  it("a pref counts only from 3 consistent signals", () => {
    const first = updatePreferences([], repeat(2, () => signal("locked", "work", "sleeve:long")));
    expect(first).toEqual([near("work", "sleeve:long", 0.3, 2)]);
    expect(activePreferences(first)).toEqual([]);

    const second = updatePreferences(first, [signal("locked", "work", "sleeve:long")]);
    expect(second[0]!.support).toBe(3);
    expect(activePreferences(second)).toEqual(second);

    const mixed = updatePreferences([], [
      signal("locked", "work", "sleeve:long"),
      signal("locked", "work", "sleeve:long"),
      signal("swapped_out", "work", "sleeve:long"),
    ]);
    expect(mixed[0]!.support).toBe(2);
    expect(activePreferences(mixed)).toEqual([]);
  });

  it("needs a value of 0.2 or more either way", () => {
    const prefs = [
      pref("work", "colour:pink", 0.19, 9),
      pref("work", "colour:teal", -0.2, 3),
      pref("work", "colour:blue", 0.2, 2),
    ];
    expect(activePreferences(prefs)).toEqual([prefs[1]]);
  });
});

describe("learnedScore", () => {
  const prefs = [
    pref("work", "sleeve:sleeveless", -0.6, 4),
    pref("casual", "sleeve:sleeveless", 0.8, 4),
    pref("work", "colour:pink", 0.5, 2),
    pref("work", "fabric:linen", 0.4, 3),
  ];

  it("reads active prefs for the day type and the piece's features", () => {
    expect(learnedScore(["sleeve:sleeveless", "colour:pink"], "work", prefs)).toBeCloseTo(-0.18, 10);
    expect(learnedScore(["sleeve:sleeveless", "fabric:linen"], "work", prefs)).toBeCloseTo(-0.06, 10);
    expect(learnedScore(["sleeve:sleeveless", "sleeve:sleeveless"], "casual", prefs)).toBeCloseTo(0.24, 10);
    expect(learnedScore(["colour:teal"], "work", prefs)).toBe(0);
    expect(learnedScore([], "work", prefs)).toBe(0);
    expect(learnedScore(["sleeve:sleeveless"], "evening", prefs)).toBe(0);
  });

  it("learnedScore is bounded to ±0.5", () => {
    const strong = FEATURES.map((f) => pref("work", f, 1, 10));
    expect(learnedScore(FEATURES, "work", strong)).toBe(0.5);
    expect(learnedScore(FEATURES, "work", strong.map((p) => ({ ...p, value: -1 })))).toBe(-0.5);

    const next = lcg(42);
    for (let i = 0; i < 300; i += 1) {
      const random = FEATURES.map((f) => pref("work", f, next() * 2 - 1, Math.floor(next() * 6)));
      const features = FEATURES.filter(() => next() < 0.6);
      const score = learnedScore(features, "work", random);
      expect(Number.isFinite(score)).toBe(true);
      expect(Math.abs(score)).toBeLessThanOrEqual(LEARN.learnedClamp);
    }
  });
});

describe("dropBodyLinked", () => {
  it("dropBodyLinked keeps colour and sleeve prefs", () => {
    const prefs = [
      pref("work", "silhouette:a_line", 0.5, 4),
      pref("work", "length:knee", 0.5, 4),
      pref("work", "rise:high", 0.5, 4),
      pref("work", "colour:pink", 0.5, 4),
      pref("work", "sleeve:sleeveless", -0.5, 4),
      pref("casual", "fabric:linen", 0.5, 4),
      pref("casual", "pattern:floral", 0.5, 4),
      pref("casual", "neckline:v", 0.5, 4),
    ];
    expect(dropBodyLinked(prefs).map((p) => p.feature)).toEqual([
      "colour:pink",
      "sleeve:sleeveless",
      "fabric:linen",
      "pattern:floral",
      "neckline:v",
    ]);
  });
});

describe("resetPreference", () => {
  it("resetPreference removes one key", () => {
    const prefs = [
      pref("work", "sleeve:sleeveless", -0.6, 4),
      pref("casual", "sleeve:sleeveless", 0.5, 4),
      pref("work", "colour:pink", 0.5, 4),
    ];
    expect(resetPreference(prefs, "work|sleeve:sleeveless")).toEqual([prefs[1], prefs[2]]);
    expect(resetPreference(prefs, "work|colour:teal")).toEqual(prefs);
  });
});
