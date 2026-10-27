import { eventMinutes, renderDayLine, styleWhy } from "../closet-notes.js";
import { prefKey } from "../closet-style/learn.js";
import { learnPalette } from "../closet-style/palette.js";
import type { StyleDay, StyleProfileInput } from "../closet-style/types.js";
import type { Backup, ClosetOutfit, DayPlan } from "../schemas/closet-week.js";
import { backupsFor, poolCache } from "./backups.js";
import { addDays } from "./dates.js";
import type { Day } from "./day.js";
import { toDay, WORK_KINDS } from "./day.js";
import type { ComposeWeekArgs, ComposerError, ComposerResult, CurrentDay } from "./input.js";
import { checkCloset, checkWeek, ComposeWeekInputSchema, dayKey, failure, inputsHashOf, parseInput } from "./input.js";
import type { DayStyle, Look, Pool, Weights, Worn } from "./looks.js";
import {
  accessorize,
  candidates,
  EMPTY_LOOK,
  NO_EXTRAS,
  poolFor,
  styleMultipliersOf,
  styleReasons,
  weightsOf,
} from "./looks.js";
import { COMPOSER_VERSION, lookOf, outfitOf, roundScore, slotsOf } from "./outfit.js";
import type { Closet, Piece } from "./pieces.js";
import { buildCloset, pushTo } from "./pieces.js";
import { dayReasons, noteReasons, reason } from "./reasons.js";
import { seededUuid } from "./rng.js";

export interface WeekComposition {
  weekStart: string;
  /** The seed as a decimal string. */
  seed: string;
  /** sha256 of the canonical inputs: the same inputs always give the same week. */
  inputsHash: string;
  composerVersion: string;
  /** Monday to Sunday. */
  days: DayPlan[];
  /** NOT_WAXED, BLOATED, BAD_HAIR, PARTY_DATE. */
  backups: Backup[];
}

/** Looks kept per day for the search, best first. */
const LOOKS_PER_DAY = 300;
/** Looks tried per day at each step of the search. */
const BEAM_WIDTH = 20;
/** After this many dead ends the search fills the week day by day instead. */
const MAX_BACKTRACKS = 200;
/** A base piece is worn at most twice a week, and never two days running. */
const MAX_USES = 2;
const REUSE_PENALTY = 0.6;
const SAME_LEAD_TONE_PENALTY = 0.2;

/** The days already in the plan are in the week, once each, and REST_OF_WEEK has every day before today. */
function checkCurrent(a: ComposeWeekArgs): ComposerError | null {
  const end = addDays(a.weekStart, 6);
  const inWeek = (date: string) => date >= a.weekStart && date <= end;
  const rest = a.mode === "REST_OF_WEEK";
  if (rest && (a.today === null || !inWeek(a.today))) {
    return failure("WRONG_DATE", "today", "REST_OF_WEEK needs today, within the week").error;
  }
  const seen = new Set<string>();
  for (let i = 0; i < a.current.length; i++) {
    const { date, outfit } = a.current[i];
    if (!inWeek(date) || seen.has(date)) {
      return failure("WRONG_DATE", `current.${i}.date`, "Each day of the week at most once").error;
    }
    seen.add(date);
    if (outfit.plannedFor !== null && outfit.plannedFor !== date) {
      return failure("WRONG_DATE", `current.${i}.outfit.plannedFor`, `Expected ${date}`).error;
    }
  }
  if (!rest) return null;
  for (let date = a.weekStart; date < (a.today as string); date = addDays(date, 1)) {
    if (!seen.has(date)) return failure("MISSING_PREVIOUS", "current", `${date} is before today, so it is kept`).error;
  }
  return null;
}

interface Use {
  day: number;
  /** On or after `asOf`: not worn yet, so it counts against the laundry. */
  future: boolean;
  active: boolean;
}

/** The week as the search builds it. */
interface State {
  days: readonly Day[];
  asOf: string;
  sweat: boolean;
  weights: Weights;
  /** Piece id → the days it is worn. */
  uses: Map<string, Use[]>;
  placed: (Worn | null)[];
  /** Each placed day's lead colour, for variety. */
  tones: (string | null)[];
}

/** The pieces that go in the wash. Footwear and accessories repeat freely. */
function washed(look: Worn): Piece[] {
  const out = [...look.core];
  if (look.layer !== null) out.push(look.layer);
  if (look.dupatta !== null) out.push(look.dupatta);
  return out;
}

function place(s: State, look: Worn, i: number): void {
  const use: Use = { day: i, future: s.days[i].date >= s.asOf, active: s.days[i].active };
  for (const p of washed(look)) pushTo(s.uses, p.id, use);
  s.placed[i] = look;
  s.tones[i] = look.core.length > 0 ? look.core[0].tone : null;
}

/** Undoes the last `place`: the search backs out in the order it went in. */
function unplace(s: State, look: Worn, i: number): void {
  for (const p of washed(look)) {
    const list = s.uses.get(p.id) as Use[];
    list.pop();
    if (list.length === 0) s.uses.delete(p.id);
  }
  s.placed[i] = null;
  s.tones[i] = null;
}

/**
 * The week's rules (§8.4): a base piece at most twice and never two days running, no more
 * wears than the laundry allows before a wash, and with the sweat rule on, nothing worn again
 * after a gym day.
 */
function allowed(s: State, look: Worn, i: number): boolean {
  for (const p of look.core) {
    const list = s.uses.get(p.id);
    if (list !== undefined && (list.length >= MAX_USES || list.some((u) => Math.abs(u.day - i) === 1))) return false;
  }
  const day = s.days[i];
  // A day before `asOf` is already worn: the laundry state counts it.
  if (day.date < s.asOf) return true;
  for (const p of washed(look)) {
    const list = s.uses.get(p.id);
    if (list === undefined) continue;
    const ahead = list.filter((u) => u.future);
    if (ahead.length >= p.capacity) return false;
    if (s.sweat && ahead.some((u) => (u.active && u.day < i) || (day.active && u.day > i))) return false;
  }
  return true;
}

/** The look's score, less what it repeats: base pieces already in the week, and the same lead colour. */
function adjusted(s: State, look: Look): number {
  let reused = 0;
  for (const p of look.core) if (s.uses.has(p.id)) reused++;
  const tone = look.core[0].tone;
  const same = tone === null ? 0 : s.tones.filter((t) => t === tone).length;
  return look.score - s.weights.variety * (REUSE_PENALTY * reused + SAME_LEAD_TONE_PENALTY * same);
}

function options(s: State, looks: readonly Look[], i: number): Look[] {
  const valid: { look: Look; score: number }[] = [];
  for (const look of looks) if (allowed(s, look, i)) valid.push({ look, score: adjusted(s, look) });
  return valid
    .sort((x, y) => y.score - x.score)
    .slice(0, BEAM_WIDTH)
    .map((v) => v.look);
}

/** Depth-first over the days, tightest first, giving up after `MAX_BACKTRACKS` dead ends. */
function search(s: State, order: readonly number[], looks: readonly Look[][], k: number, budget: { left: number }): boolean {
  if (k === order.length) return true;
  const i = order[k];
  for (const look of options(s, looks[i], i)) {
    place(s, look, i);
    if (search(s, order, looks, k + 1, budget)) return true;
    unplace(s, look, i);
    if (--budget.left < 0) return false;
  }
  return false;
}

/** Each day's styled pool, built the first time the search needs it. */
function styledPools(closet: Closet, days: readonly Day[], weights: Weights, styles: readonly DayStyle[]): (index: number) => Pool {
  const pools = new Map<number, Pool>();
  return (index) => {
    let pool = pools.get(index);
    if (pool === undefined) {
      pool = poolFor(closet, days[index], weights, styles[index]);
      pools.set(index, pool);
    }
    return pool;
  };
}

function unavailable(id: string, day: Day): ClosetOutfit {
  const reasons = [reason("DAY_UNAVAILABLE", { day: day.name })];
  return outfitOf(
    {},
    {
      id,
      kind: "DAY",
      occasion: day.occasion,
      plannedFor: day.date,
      note: renderDayLine(reasons),
      noteReasons: reasons,
      score: null,
      status: "UNAVAILABLE",
    },
  );
}

const FESTIVE_KINDS = new Set(["WEDDING", "FESTIVE"]);

/**
 * The day as the style engine reads it (style spec §5). Festive for a wedding or festival, evening
 * when it runs late, work for work events, active for a gym day, casual otherwise. The forecast's
 * rain chance comes in beside it, since the composer's `Day` keeps only whether it rains.
 */
export function toStyleDay(day: Day, rainChance: number | null = null): StyleDay {
  const festive = [...day.kinds].some((k) => FESTIVE_KINDS.has(k));
  const work = [...day.kinds].some((k) => WORK_KINDS.has(k));
  let longest: number | null = null;
  for (const e of day.events) {
    const minutes = eventMinutes(e);
    if (minutes !== null && (longest === null || minutes > longest)) longest = minutes;
  }
  return {
    date: day.date,
    dayType: festive ? "festive" : day.evening ? "evening" : work ? "work" : day.active ? "active" : "casual",
    highC: day.high,
    rainChance: rainChance ?? (day.rainy ? 1 : null),
    humidity: null,
    longDay: day.long,
    hours: longest === null ? null : longest / 60,
    formality: day.target,
    festive,
  };
}

const byText = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** The profile with its lists in one order, so the order they arrive in changes neither the hash nor the week. */
function canonicalProfile(p: StyleProfileInput | null): StyleProfileInput | null {
  if (p === null) return null;
  return {
    version: p.version,
    likes: p.likes === null ? null : { define: [...p.likes.define].sort(), cover: [...p.likes.cover].sort(), sit: p.likes.sit },
    proportions: p.proportions,
    learned: [...p.learned].sort((x, y) => byText(prefKey(x), prefKey(y))),
  };
}

/** Each day's style: the palette learned once from the closet and its wears, the profile, the multipliers. */
function dayStyles(a: ComposeWeekArgs, days: readonly Day[], profile: StyleProfileInput | null): DayStyle[] {
  // learnPalette takes the items in id order itself, whatever order they come in.
  const items = a.items.filter((i) => i.deletedAt === null);
  const metrics = a.metrics.map((m) => ({ itemId: m.wardrobeItemId, wears180: m.wears180 ?? 0 }));
  const ctx = { profile, palette: learnPalette(items, metrics) };
  const multipliers = styleMultipliersOf(a.settings);
  return days.map((d, i) => ({ day: toStyleDay(d, a.days[i].weather?.rainChance ?? null), ctx, multipliers }));
}

/**
 * Plans Monday to Sunday from the user's own closet, one look a day, and the week's four
 * backups. Pure: the same input always gives the same week, and bad input comes back as an
 * error rather than a throw.
 */
export function composeWeek(input: unknown): ComposerResult<WeekComposition> {
  return composeWeekWith(input, { style: true });
}

/**
 * `composeWeek` with the style engine on or off. Off scores the days as the composer did before
 * it, for comparisons and budgets; the backups are scored that way either way.
 */
export function composeWeekWith(input: unknown, engine: { style: boolean }): ComposerResult<WeekComposition> {
  const parsed = parseInput(ComposeWeekInputSchema, input);
  if (!parsed.ok) return parsed;
  const a = parsed.value;
  const error = checkWeek(a.weekStart, a.days) ?? checkCloset(a.items, a.metrics) ?? checkCurrent(a);
  if (error !== null) return { ok: false, error };

  const asOf = a.today ?? a.weekStart;
  const closet = buildCloset(a.items, a.metrics, a.settings, a.seed, asOf);
  const weights = weightsOf(a.settings);
  const days = a.days.map(toDay);
  const profile = canonicalProfile(a.styleProfile);
  const plain = poolCache(closet, days, weights);
  const styles = engine.style ? dayStyles(a, days, profile) : null;
  const pools = styles === null ? plain : styledPools(closet, days, weights, styles);
  const inputsHash = inputsHashOf(
    {
      v: COMPOSER_VERSION,
      kind: "WEEK",
      weekStart: a.weekStart,
      mode: a.mode,
      today: a.today,
      days: a.days.map(dayKey),
      current: [...a.current].sort((x, y) => (x.date < y.date ? -1 : 1)),
      style: profile,
    },
    a,
  );
  const s: State = {
    days,
    asOf,
    sweat: closet.laundry.sweat,
    weights,
    uses: new Map(),
    placed: days.map(() => null),
    tones: days.map(() => null),
  };

  // Locked days stay as they are, and so in REST_OF_WEEK do the days before today.
  const keepBefore = a.mode === "REST_OF_WEEK" ? (a.today as string) : "";
  const byDate = new Map(a.current.map((c) => [c.date, c]));
  const kept = days.map((d): CurrentDay | null => {
    const c = byDate.get(d.date);
    return c !== undefined && (c.locked || d.date < keepBefore) ? c : null;
  });
  const looks: Look[][] = days.map(() => []);
  const counts = days.map(() => 0);
  const order: number[] = [];
  for (const d of days) {
    const c = kept[d.index];
    if (c !== null) {
      place(s, lookOf(c.outfit, closet), d.index);
      continue;
    }
    const found = candidates(pools(d.index), {}, LOOKS_PER_DAY);
    looks[d.index] = found.looks;
    counts[d.index] = found.count;
    if (found.count > 0) order.push(d.index);
  }
  order.sort((x, y) => counts[x] - counts[y] || x - y);
  if (!search(s, order, looks, 0, { left: MAX_BACKTRACKS })) {
    // No week keeps every rule: fill what can be filled, tightest day first.
    for (const i of order) {
      const [first] = options(s, looks[i], i);
      if (first !== undefined) place(s, first, i);
    }
  }

  const plan: Worn[] = [];
  const result = days.map((day): DayPlan => {
    const context = { label: day.label, tempMaxC: day.high, events: [...day.events] };
    const c = kept[day.index];
    if (c !== null) {
      plan.push(s.placed[day.index] as Worn);
      return { date: day.date, context, outfit: c.outfit, locked: c.locked };
    }
    const id = seededUuid(closet.seed, `${inputsHash}|DAY|${day.date}`);
    const found = s.placed[day.index] as Look | null;
    if (found === null) {
      plan.push(EMPTY_LOOK);
      return { date: day.date, context, outfit: unavailable(id, day), locked: false };
    }
    const style = styles === null ? null : styles[day.index];
    const look = accessorize(found, closet, day, weights, NO_EXTRAS, style);
    plan.push(look);
    const reasons = [...dayReasons(look, day), ...noteReasons(look)];
    const outfit = outfitOf(slotsOf(look), {
      id,
      kind: "DAY",
      occasion: day.occasion,
      plannedFor: day.date,
      note: renderDayLine(reasons),
      noteReasons: reasons,
      score: roundScore(look.score),
      styleWhy: style === null ? null : styleWhy(styleReasons(look, style)),
    });
    return { date: day.date, context, outfit, locked: false };
  });

  // The backups are scored without the style terms, as `composeBackups` scores them.
  const backups = backupsFor({
    closet,
    days,
    plan,
    weights,
    inputsHash,
    checksEnabled: a.settings.checksEnabled,
    pools: plain,
  });
  return {
    ok: true,
    value: {
      weekStart: a.weekStart,
      seed: closet.seed,
      inputsHash,
      composerVersion: COMPOSER_VERSION,
      days: result,
      backups,
    },
  };
}
