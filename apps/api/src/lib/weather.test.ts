import { afterEach, describe, expect, it } from "vitest";
import { mockWeatherFromDateLat, resolveWeather } from "./weather.js";

describe("mockWeatherFromDateLat", () => {
  it("is deterministic for the same date + lat", () => {
    const d = new Date("2026-08-26T08:00:00.000Z");
    const a = mockWeatherFromDateLat(d, 12.97);
    const b = mockWeatherFromDateLat(d, 12.97);
    expect(a).toEqual(b);
    expect(a.source).toBe("mock");
    expect(a.tempC).toBeGreaterThanOrEqual(18);
    expect(a.tempC).toBeLessThanOrEqual(33);
  });
});

describe("resolveWeather", () => {
  const original = process.env.WEATHER_API;

  afterEach(() => {
    if (original === undefined) delete process.env.WEATHER_API;
    else process.env.WEATHER_API = original;
  });

  it("returns mock when WEATHER_API unset", async () => {
    delete process.env.WEATHER_API;
    const w = await resolveWeather({ date: new Date("2026-01-01T00:00:00.000Z") });
    expect(w.source).toBe("mock");
  });

  it("parses simple {tempC,condition} payloads", async () => {
    process.env.WEATHER_API = "https://weather.test/{lat}/{lon}";
    const w = await resolveWeather({
      lat: 19.07,
      lon: 72.87,
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({ tempC: 29, condition: "humid" }),
        }) as Response) as typeof fetch,
    });
    expect(w.source).toBe("api");
    expect(w.tempC).toBe(29);
    expect(w.condition).toBe("humid");
  });

  it("parses Open-Meteo current.temperature_2m", async () => {
    process.env.WEATHER_API = "https://api.open-meteo.test/?lat={lat}";
    const w = await resolveWeather({
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({
            current: { temperature_2m: 31.4, weather_code: 61 },
          }),
        }) as Response) as typeof fetch,
    });
    expect(w.source).toBe("api");
    expect(w.tempC).toBe(31);
    expect(w.condition).toBe("rain");
  });

  it("falls back to mock on non-OK or invalid payload", async () => {
    process.env.WEATHER_API = "https://weather.test";
    const badStatus = await resolveWeather({
      fetchImpl: (async () => ({ ok: false }) as Response) as typeof fetch,
    });
    expect(badStatus.source).toBe("mock");

    const badJson = await resolveWeather({
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({ nonsense: true }),
        }) as Response) as typeof fetch,
    });
    expect(badJson.source).toBe("mock");
  });

  it("falls back to mock when fetch throws", async () => {
    process.env.WEATHER_API = "https://weather.test";
    const w = await resolveWeather({
      fetchImpl: (async () => {
        throw new Error("network");
      }) as typeof fetch,
    });
    expect(w.source).toBe("mock");
  });
});
