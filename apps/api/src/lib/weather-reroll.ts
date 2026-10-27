import type { WeatherCtx } from "./weather.js";

/** °C delta that counts as a meaningful forecast shift. */
export const WEATHER_REROLL_TEMP_DELTA_C = 5;

/** Local hour (0–23) after which morning re-roll is skipped. */
export const WEATHER_REROLL_NOON_HOUR = 12;

const RAINY = new Set(["rain", "drizzle", "storm", "thunderstorm"]);
const CLEARISH = new Set(["sunny", "clear", "partly_cloudy"]);

function normalizeCondition(c: string): string {
  return c.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * True when temperature or condition moved enough to invalidate the morning pick.
 */
export function weatherShiftExceedsThreshold(
  prev: Pick<WeatherCtx, "tempC" | "condition">,
  next: Pick<WeatherCtx, "tempC" | "condition">,
  opts?: { tempDeltaC?: number },
): boolean {
  const delta = opts?.tempDeltaC ?? WEATHER_REROLL_TEMP_DELTA_C;
  if (Math.abs(next.tempC - prev.tempC) >= delta) return true;

  const a = normalizeCondition(prev.condition);
  const b = normalizeCondition(next.condition);
  if (a === b) return false;

  // Rain ↔ dry or clear ↔ heavy cloud/rain are wardrobe-relevant
  const aRain = RAINY.has(a) || a.includes("rain");
  const bRain = RAINY.has(b) || b.includes("rain");
  if (aRain !== bRain) return true;

  const aClear = CLEARISH.has(a);
  const bClear = CLEARISH.has(b);
  if (aClear !== bClear) return true;

  return false;
}

/**
 * Re-roll only before local noon when the forecast shifted past threshold.
 */
export function shouldRerollOutfitForWeather(opts: {
  prevWeather: Pick<WeatherCtx, "tempC" | "condition"> | null | undefined;
  currentWeather: Pick<WeatherCtx, "tempC" | "condition">;
  now?: Date;
  noonHour?: number;
  tempDeltaC?: number;
  /** Timezone offset minutes east of UTC (Date#getTimezoneOffset is inverted). Default: local. */
  tzOffsetMinutes?: number;
}): boolean {
  if (!opts.prevWeather) return false;
  const now = opts.now ?? new Date();
  const noonHour = opts.noonHour ?? WEATHER_REROLL_NOON_HOUR;

  let localHour: number;
  if (opts.tzOffsetMinutes != null) {
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
    const local = new Date(utcMs + opts.tzOffsetMinutes * 60_000);
    localHour = local.getHours();
  } else {
    localHour = now.getHours();
  }
  if (localHour >= noonHour) return false;

  return weatherShiftExceedsThreshold(opts.prevWeather, opts.currentWeather, {
    tempDeltaC: opts.tempDeltaC,
  });
}

/** Pull weather fields from an outfit's stored weatherCtx jsonb. */
export function weatherFromCtx(
  ctx: Record<string, unknown> | null | undefined,
): Pick<WeatherCtx, "tempC" | "condition"> | null {
  if (!ctx) return null;
  const tempC = typeof ctx.tempC === "number" ? ctx.tempC : null;
  const condition = typeof ctx.condition === "string" ? ctx.condition : null;
  if (tempC == null || !condition) return null;
  return { tempC, condition };
}
