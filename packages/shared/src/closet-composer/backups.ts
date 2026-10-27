import type { BackupWhyInput } from "../closet-notes.js";
import { BACKUP_WHY_NONE, backupMissing, backupWhy, renderNote } from "../closet-notes.js";
import type { Backup, BackupCheck } from "../schemas/closet-week.js";
import type { CheckDef } from "./checks.js";
import { CHECK_ORDER, CHECKS, ZONES } from "./checks.js";
import type { Day } from "./day.js";
import { toDay } from "./day.js";
import type { ComposerResult } from "./input.js";
import { checkCloset, checkWeek, ComposeBackupsInputSchema, dayKey, failure, inputsHashOf, parseInput } from "./input.js";
import type { Pool, Weights, Worn } from "./looks.js";
import { accessorize, candidates, fits, poolFor, weightsOf } from "./looks.js";
import { COMPOSER_VERSION, lookOf, outfitOf, roundScore, slotsOf } from "./outfit.js";
import type { Closet, Piece } from "./pieces.js";
import { buildCloset } from "./pieces.js";
import { seededUuid } from "./rng.js";

/** Each day's pool, built the first time a search needs it. */
export function poolCache(closet: Closet, days: readonly Day[], weights: Weights): (index: number) => Pool {
  const pools = new Map<number, Pool>();
  return (index) => {
    let pool = pools.get(index);
    if (pool === undefined) {
      pool = poolFor(closet, days[index], weights);
      pools.set(index, pool);
    }
    return pool;
  };
}

export interface BackupContext {
  closet: Closet;
  days: readonly Day[];
  /** The week's looks, Monday first; an empty core where a day has none. */
  plan: readonly Worn[];
  weights: Weights;
  /** Outfit ids derive from it, so a new composition never reuses an old row's id. */
  inputsHash: string;
  checksEnabled: Partial<Record<BackupCheck, boolean>>;
  pools: (index: number) => Pool;
}

/** Pieces already in the plan count against a backup, so it brings something new. */
const PLAN_PENALTY = 0.5;

function firstTrip(def: CheckDef, ctx: BackupContext): { index: number; trip: BackupWhyInput } | null {
  for (let i = 0; i < ctx.days.length; i++) {
    const trip = ctx.plan[i].core.length > 0 ? def.trip(ctx.plan[i], ctx.days[i]) : null;
    if (trip !== null) return { index: i, trip };
  }
  return null;
}

function backupFor(ctx: BackupContext, check: BackupCheck, bias: (p: Piece) => number): Backup {
  if (ctx.checksEnabled[check] === false) {
    return { check, status: "UNAVAILABLE", forDay: null, fitsDays: [], outfit: null, why: "", missing: null };
  }
  const def = CHECKS[check];
  const tripped = firstTrip(def, ctx);
  const trip = tripped === null ? null : tripped.trip;
  const forDay = tripped === null ? null : ctx.days[tripped.index].date;
  const why = trip === null ? BACKUP_WHY_NONE[check] : backupWhy(trip);
  // The day that tripped the check first, then the rest of the week in order.
  const lead = tripped === null ? -1 : tripped.index;
  const targets = [...(lead < 0 ? [] : [lead]), ...ctx.days.map((d) => d.index).filter((i) => i !== lead)];
  for (const t of targets) {
    const replaced = ctx.plan[t];
    const [found] = candidates(ctx.pools(t), { ...def.rule(trip, replaced), bias }, 1).looks;
    if (found === undefined) continue;
    const day = ctx.days[t];
    const look = accessorize(found, ctx.closet, day, ctx.weights, def.extras(replaced));
    const fitsDays = ctx.days.filter((d) => fits(look, d, ctx.closet.asOf)).map((d) => d.date);
    const slots = slotsOf(look);
    const noteReasons = def.notes(look, replaced);
    const outfit = outfitOf(slots, {
      id: seededUuid(ctx.closet.seed, `${ctx.inputsHash}|BACKUP|${check}`),
      kind: "BACKUP",
      occasion: day.occasion,
      plannedFor: null,
      backupCheck: check,
      forDay,
      fitsDays,
      note: renderNote(noteReasons),
      noteReasons,
      score: roundScore(look.score),
    });
    return { check, status: "READY", forDay, fitsDays, outfit, why, missing: null };
  }
  const zones = trip?.check === "NOT_WAXED" ? trip.zones : ZONES;
  return { check, status: "UNAVAILABLE", forDay, fitsDays: [], outfit: null, why, missing: backupMissing(check, zones, "this week") };
}

/** The week's four backups (§8.5), in the site's order. They are never part of the plan. */
export function backupsFor(ctx: BackupContext): Backup[] {
  const inPlan = new Set(ctx.plan.flatMap((look) => look.core.map((p) => p.id)));
  const bias = (p: Piece) => (inPlan.has(p.id) ? -PLAN_PENALTY : 0);
  return CHECK_ORDER.map((check) => backupFor(ctx, check, bias));
}

/** Recomposes the backups for a plan that changed after it was composed: a swap, a lock, a new day. */
export function composeBackups(input: unknown): ComposerResult<Backup[]> {
  const parsed = parseInput(ComposeBackupsInputSchema, input);
  if (!parsed.ok) return parsed;
  const a = parsed.value;
  const error = checkWeek(a.weekStart, a.days) ?? checkCloset(a.items, a.metrics);
  if (error !== null) return { ok: false, error };
  for (let i = 0; i < a.plan.length; i++) {
    const plannedFor = a.plan[i].plannedFor;
    if (plannedFor !== null && plannedFor !== a.days[i].date) {
      return failure("WRONG_DATE", `plan.${i}.plannedFor`, `Expected ${a.days[i].date}`);
    }
  }
  const closet = buildCloset(a.items, a.metrics, a.settings, a.seed, a.today ?? a.weekStart);
  const days = a.days.map(toDay);
  const weights = weightsOf(a.settings);
  const inputsHash = inputsHashOf(
    { v: COMPOSER_VERSION, kind: "BACKUPS", weekStart: a.weekStart, today: a.today, days: a.days.map(dayKey), plan: a.plan },
    a,
  );
  return {
    ok: true,
    value: backupsFor({
      closet,
      days,
      plan: a.plan.map((outfit) => lookOf(outfit, closet)),
      weights,
      inputsHash,
      checksEnabled: a.settings.checksEnabled,
      pools: poolCache(closet, days, weights),
    }),
  };
}
