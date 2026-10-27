/**
 * Closet weather helper.
 *
 * Structure (always returned):
 *   { tempC: number, condition: string, source: "api" | "mock", fetchedAt: string }
 *
 * If `WEATHER_API` is set (URL template or base URL), we fetch live weather.
 * Supported shapes:
 *   - Open-Meteo-like: `{ current: { temperature_2m, weather_code } }`
 *   - Simple: `{ tempC, condition }` or `{ temperature, weather }`
 * On fetch failure, falls back to a deterministic mock from date + lat.
 */

export type WeatherCtx = {
  tempC: number;
  condition: string;
  source: "api" | "mock";
  fetchedAt: string;
  lat?: number;
};

const CONDITIONS = ["sunny", "partly_cloudy", "cloudy", "rain", "humid", "clear"] as const;

function hashSeed(dateIso: string, lat: number): number {
  let h = 0;
  const s = `${dateIso.slice(0, 10)}:${lat.toFixed(2)}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic mock weather from calendar date + latitude (no network). */
export function mockWeatherFromDateLat(date = new Date(), lat = 12.97): WeatherCtx {
  const seed = hashSeed(date.toISOString(), lat);
  const tempC = 18 + (seed % 16); // 18–33°C
  const condition = CONDITIONS[seed % CONDITIONS.length]!;
  return {
    tempC,
    condition,
    source: "mock",
    fetchedAt: date.toISOString(),
    lat,
  };
}

function mapWeatherCode(code: number): string {
  if (code === 0) return "clear";
  if (code <= 2) return "partly_cloudy";
  if (code <= 3) return "cloudy";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 80) return "rain";
  return "humid";
}

function parseWeatherPayload(data: unknown): Pick<WeatherCtx, "tempC" | "condition"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.tempC === "number" && typeof d.condition === "string") {
    return { tempC: d.tempC, condition: d.condition };
  }
  if (typeof d.temperature === "number") {
    return {
      tempC: d.temperature,
      condition: typeof d.weather === "string" ? d.weather : typeof d.condition === "string" ? d.condition : "clear",
    };
  }
  const current = d.current as Record<string, unknown> | undefined;
  if (current && typeof current.temperature_2m === "number") {
    const code = typeof current.weather_code === "number" ? current.weather_code : 0;
    return { tempC: Math.round(current.temperature_2m), condition: mapWeatherCode(code) };
  }
  return null;
}

/**
 * Resolve weather for outfit generation.
 * Prefers `WEATHER_API` env (URL; `{lat}` / `{lon}` placeholders supported).
 */
export async function resolveWeather(opts?: {
  lat?: number;
  lon?: number;
  date?: Date;
  fetchImpl?: typeof fetch;
}): Promise<WeatherCtx> {
  const lat = opts?.lat ?? 12.97;
  const lon = opts?.lon ?? 77.59;
  const date = opts?.date ?? new Date();
  const api = process.env.WEATHER_API?.trim();
  if (!api) return mockWeatherFromDateLat(date, lat);

  const url = api.replace(/\{lat\}/g, String(lat)).replace(/\{lon\}/g, String(lon));
  try {
    const fetchFn = opts?.fetchImpl ?? fetch;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return mockWeatherFromDateLat(date, lat);
    const parsed = parseWeatherPayload(await res.json());
    if (!parsed) return mockWeatherFromDateLat(date, lat);
    return {
      ...parsed,
      source: "api",
      fetchedAt: new Date().toISOString(),
      lat,
    };
  } catch {
    return mockWeatherFromDateLat(date, lat);
  }
}
