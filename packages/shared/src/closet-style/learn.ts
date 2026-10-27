import type { DayType, FeatureFamily, FeaturePref, FeatureValue } from "./types.js";

/**
 * The weekly feature-preference update (spec §7). Pure: the API job loads the week's
 * signals and the stored preferences, calls `updatePreferences`, and stores the result.
 */

/** What the user did with a composed look (spec §7), plus dismissing a gap (§6.3). */
export type StyleAction = "kept" | "swapped_out" | "swapped_in" | "locked" | "skipped" | "worn" | "gap_dismissed";

/** How much each action says about the features of the pieces it touched. Starting values. */
export const ACTION_VALUE: Readonly<Record<StyleAction, number>> = {
  locked: 1,
  worn: 1,
  swapped_in: 1,
  kept: 0.25,
  swapped_out: -1,
  skipped: -0.5,
  gap_dismissed: -0.5,
};

/** One action on one look or piece, with the feature values of the pieces involved. */
export interface StyleSignal {
  action: StyleAction;
  dayType: DayType;
  features: readonly FeatureValue[];
}

/** The learning numbers (spec §7). Starting values. */
export const LEARN = { decay: 0.7, minSupport: 3, cap: 200, learnedWeight: 0.3, learnedClamp: 0.5 } as const;

/** A preference counts once its value reaches this, either way (with `LEARN.minSupport`). */
export const LEARN_ACTIVE_MIN_VALUE = 0.2;

/** A preference that decays below this is removed. */
export const LEARN_DROP_BELOW = 0.01;

/** Feature families that describe how a piece sits on the body. Withdrawing BODY_PROFILE removes them (§3.3). */
export const BODY_LINKED_FAMILIES: ReadonlySet<FeatureFamily> = new Set<FeatureFamily>([
  "silhouette",
  "length",
  "rise",
]);

/** The stored key of a preference: `${dayType}|${feature}`. */
export function prefKey(p: { dayType: DayType; feature: FeatureValue }): string {
  return `${p.dayType}|${p.feature}`;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Code-unit order, so the result never depends on the runtime's locale. */
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface WeekTally {
  dayType: DayType;
  feature: FeatureValue;
  sum: number;
  count: number;
  positive: number;
  negative: number;
}

/**
 * One week's update. For each key, m is this week's mean signal over the signals carrying its feature:
 * - the new value is clamp(old × decay + m × (1 − decay), −1, 1); a key without signals just decays;
 * - support adds this week's signals that agree with the new sign, and restarts at that count when the sign flips;
 * - values below `LEARN_DROP_BELOW` are removed;
 * - the strongest `LEARN.cap` by |value| × support are kept (ties by key) and returned sorted by key.
 */
export function updatePreferences(prev: readonly FeaturePref[], week: readonly StyleSignal[]): FeaturePref[] {
  const tallies = new Map<string, WeekTally>();
  for (const s of week) {
    if (!Object.hasOwn(ACTION_VALUE, s.action)) continue;
    const v = ACTION_VALUE[s.action];
    for (const feature of new Set(s.features)) {
      const key = prefKey({ dayType: s.dayType, feature });
      let t = tallies.get(key);
      if (!t) {
        t = { dayType: s.dayType, feature, sum: 0, count: 0, positive: 0, negative: 0 };
        tallies.set(key, t);
      }
      t.sum += v;
      t.count += 1;
      if (v > 0) t.positive += 1;
      else if (v < 0) t.negative += 1;
    }
  }

  const stored = new Map<string, FeaturePref>();
  for (const p of prev) {
    const key = prefKey(p);
    if (!stored.has(key) && Number.isFinite(p.value)) stored.set(key, p);
  }

  const next: { key: string; pref: FeaturePref }[] = [];
  for (const key of new Set([...stored.keys(), ...tallies.keys()])) {
    const before = stored.get(key);
    const t = tallies.get(key);
    const oldValue = before ? clamp(before.value, -1, 1) : 0;
    const oldSupport = before && Number.isFinite(before.support) ? Math.max(0, Math.floor(before.support)) : 0;
    let value = oldValue * LEARN.decay;
    let support = oldSupport;
    if (t) {
      value = clamp(value + (t.sum / t.count) * (1 - LEARN.decay), -1, 1);
      const agreeing = value > 0 ? t.positive : value < 0 ? t.negative : 0;
      support = Math.sign(value) === Math.sign(oldValue) ? oldSupport + agreeing : agreeing;
    }
    if (Math.abs(value) < LEARN_DROP_BELOW) continue;
    const { dayType, feature } = (before ?? t)!;
    next.push({ key, pref: { dayType, feature, value, support } });
  }

  const strength = (p: FeaturePref): number => Math.abs(p.value) * p.support;
  next.sort((a, b) => strength(b.pref) - strength(a.pref) || byString(a.key, b.key));
  return next
    .slice(0, LEARN.cap)
    .sort((a, b) => byString(a.key, b.key))
    .map((n) => n.pref);
}

function isActive(p: FeaturePref): boolean {
  return p.support >= LEARN.minSupport && Math.abs(p.value) >= LEARN_ACTIVE_MIN_VALUE;
}

/** The preferences strong enough to count: support ≥ `LEARN.minSupport` and |value| ≥ `LEARN_ACTIVE_MIN_VALUE`. */
export function activePreferences(prefs: readonly FeaturePref[]): FeaturePref[] {
  return prefs.filter(isActive);
}

/**
 * The learned part of the `likes` term for one piece on one day type:
 * Σ value × `LEARN.learnedWeight` over the active prefs matching the day type and any of the features,
 * clamped to ±`LEARN.learnedClamp`.
 */
export function learnedScore(
  features: readonly FeatureValue[],
  dayType: DayType,
  prefs: readonly FeaturePref[],
): number {
  if (features.length === 0) return 0;
  const has = new Set(features);
  let sum = 0;
  for (const p of prefs) {
    if (p.dayType === dayType && has.has(p.feature) && isActive(p)) sum += p.value * LEARN.learnedWeight;
  }
  return clamp(sum, -LEARN.learnedClamp, LEARN.learnedClamp);
}

function familyOf(feature: FeatureValue): FeatureFamily {
  return feature.slice(0, feature.indexOf(":")) as FeatureFamily;
}

/** The preferences without the body-linked families, for when BODY_PROFILE consent is withdrawn. */
export function dropBodyLinked(prefs: readonly FeaturePref[]): FeaturePref[] {
  return prefs.filter((p) => !BODY_LINKED_FAMILIES.has(familyOf(p.feature)));
}

/** The preferences without the one under `key` ("That's not right", §6.4). */
export function resetPreference(prefs: readonly FeaturePref[], key: string): FeaturePref[] {
  return prefs.filter((p) => prefKey(p) !== key);
}
