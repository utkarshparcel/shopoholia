/**
 * Closet weather helper.
 *
 * If `WEATHER_API` is set (URL template or base URL), we fetch live weather.
 * Supported shapes:
 *   - Open-Meteo-like: `{ current: { temperature_2m, weather_code } }`
 *   - Simple: `{ tempC, condition }` or `{ temperature, weather }`
 * With no provider, or when the fetch fails, the answer is null: no weather is shown or used,
 * and nothing is invented (C5).
 */

export type WeatherCtx = {
  tempC: number;
  condition: string;
  source: "api";
  fetchedAt: string;
  lat?: number;
};

/** Per-request budget for the provider call. */
export const WEATHER_TIMEOUT_MS = 4_000;

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
 * Resolve weather for outfit generation, or null when there is no provider or it didn't answer.
 * Uses `WEATHER_API` (URL; `{lat}` / `{lon}` placeholders supported).
 */
export async function resolveWeather(opts?: {
  lat?: number;
  lon?: number;
  date?: Date;
  fetchImpl?: typeof fetch;
}): Promise<WeatherCtx | null> {
  const lat = opts?.lat ?? 12.97;
  const lon = opts?.lon ?? 77.59;
  const api = process.env.WEATHER_API?.trim();
  if (!api) return null;

  const url = api.replace(/\{lat\}/g, String(lat)).replace(/\{lon\}/g, String(lon));
  try {
    const fetchFn = opts?.fetchImpl ?? fetch;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!res.ok) return null;
    const parsed = parseWeatherPayload(await res.json());
    if (!parsed) return null;
    return {
      ...parsed,
      source: "api",
      fetchedAt: new Date().toISOString(),
      lat,
    };
  } catch {
    return null;
  }
}
