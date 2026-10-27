import { afterEach, describe, expect, it } from "vitest";
import { resolveWeather } from "./weather.js";

describe("resolveWeather", () => {
  const original = process.env.WEATHER_API;

  afterEach(() => {
    if (original === undefined) delete process.env.WEATHER_API;
    else process.env.WEATHER_API = original;
  });

  it("is null when WEATHER_API is unset, and never calls out", async () => {
    delete process.env.WEATHER_API;
    let called = false;
    const w = await resolveWeather({
      date: new Date("2026-01-01T00:00:00.000Z"),
      fetchImpl: (async () => {
        called = true;
        throw new Error("unexpected");
      }) as typeof fetch,
    });
    expect(w).toBeNull();
    expect(called).toBe(false);
  });

  it("parses simple {tempC,condition} payloads", async () => {
    process.env.WEATHER_API = "https://weather.test/{lat}/{lon}";
    let url = "";
    const w = await resolveWeather({
      lat: 19.07,
      lon: 72.87,
      fetchImpl: (async (u: string) => {
        url = u;
        return {
          ok: true,
          json: async () => ({ tempC: 29, condition: "humid" }),
        } as Response;
      }) as unknown as typeof fetch,
    });
    expect(url).toBe("https://weather.test/19.07/72.87");
    expect(w?.source).toBe("api");
    expect(w?.tempC).toBe(29);
    expect(w?.condition).toBe("humid");
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
    expect(w?.source).toBe("api");
    expect(w?.tempC).toBe(31);
    expect(w?.condition).toBe("rain");
  });

  it("is null on a non-OK status or an unknown payload", async () => {
    process.env.WEATHER_API = "https://weather.test";
    const badStatus = await resolveWeather({
      fetchImpl: (async () => ({ ok: false }) as Response) as typeof fetch,
    });
    expect(badStatus).toBeNull();

    const badJson = await resolveWeather({
      fetchImpl: (async () =>
        ({
          ok: true,
          json: async () => ({ nonsense: true }),
        }) as Response) as typeof fetch,
    });
    expect(badJson).toBeNull();
  });

  it("is null when the fetch throws or times out", async () => {
    process.env.WEATHER_API = "https://weather.test";
    const w = await resolveWeather({
      fetchImpl: (async () => {
        throw new Error("network");
      }) as typeof fetch,
    });
    expect(w).toBeNull();

    let signal: AbortSignal | undefined;
    await resolveWeather({
      fetchImpl: (async (_u: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        throw new DOMException("timed out", "TimeoutError");
      }) as unknown as typeof fetch,
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
