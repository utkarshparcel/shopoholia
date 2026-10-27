import { describe, it, expect, afterEach, vi } from "vitest";
import type { TodayOutfitResponse, WeekOutfitsResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";
import { resolveWeather } from "../lib/weather.js";
import * as weatherReroll from "../lib/weather-reroll.js";

const prevWeatherApi = process.env.WEATHER_API;
function restoreWeatherApi() {
  if (prevWeatherApi === undefined) delete process.env.WEATHER_API;
  else process.env.WEATHER_API = prevWeatherApi;
}

/** A weather provider for the routes: WEATHER_API plus a fetch that answers it. */
function stubWeather(reading: { tempC: number; condition: string }) {
  process.env.WEATHER_API = "https://weather.test/{lat}/{lon}";
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://weather.test/")) {
      return new Response(JSON.stringify(reading), { status: 200 });
    }
    return realFetch(input, init);
  });
}

describe("weather helper", () => {
  afterEach(restoreWeatherApi);

  it("is null without WEATHER_API: no invented weather (C5)", async () => {
    delete process.env.WEATHER_API;
    expect(await resolveWeather({ lat: 12.97, lon: 77.59 })).toBeNull();
  });

  it("fetches from WEATHER_API when set", async () => {
    process.env.WEATHER_API = "https://weather.test/{lat}/{lon}";
    const weather = await resolveWeather({
      lat: 12.97,
      lon: 77.59,
      fetchImpl: async () =>
        new Response(JSON.stringify({ tempC: 29, condition: "humid" }), { status: 200 }),
    });
    expect(weather?.source).toBe("api");
    expect(weather?.tempC).toBe(29);
    expect(weather?.condition).toBe("humid");
  });
});

describe("outfits", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreWeatherApi();
  });

  it("without a weather provider the outfit has no weather and no weather reason", async () => {
    delete process.env.WEATHER_API;
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", colors: ["white"], imageKeys: [`u/${userId}/w/s.jpg`] },
    });
    const today = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(today.statusCode).toBe(200);
    const body = today.json() as TodayOutfitResponse;
    expect(body.outfit!.weatherCtx).toBeNull();
    expect(body.outfit!.whyThis!.some((s) => /weather|mock/i.test(s))).toBe(false);
  });

  it("generates outfit with weatherCtx structure and whyThis", async () => {
    stubWeather({ tempC: 31, condition: "sunny" });
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    await repos.saveStyleProfile(userId, { tags: ["jeans", "blue"], answers: {} });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", colors: ["blue"], imageKeys: [`u/${userId}/w/j.jpg`], garmentImageKey: `u/${userId}/w/j.jpg` },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", colors: ["white"], imageKeys: [`u/${userId}/w/s.jpg`], garmentImageKey: `u/${userId}/w/s.jpg` },
    });

    const today = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(today.statusCode).toBe(200);
    const body = today.json() as TodayOutfitResponse;
    expect(body.outfit).not.toBeNull();
    expect(body.outfit!.weatherCtx).toMatchObject({ tempC: 31, condition: "sunny", source: "api" });
    expect(body.outfit!.whyThis).toBeDefined();
    expect(body.outfit!.whyThis!.length).toBeGreaterThan(0);
    expect(body.outfit!.whyThis!.some((s) => /taste|weather|wear|clean|laundry|staples|skipped/i.test(s))).toBe(
      true,
    );
    expect(body.outfit!.plannedFor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("POST /outfits/generate returns whyThis", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", imageKeys: [`u/${userId}/w/k.jpg`], garmentImageKey: `u/${userId}/w/k.jpg` },
    });
    const res = await app.inject({
      method: "POST",
      url: "/outfits/generate",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { outfit: TodayOutfitResponse["outfit"] };
    expect(body.outfit?.whyThis?.length).toBeGreaterThan(0);
  });

  it("outfit generator skips DIRTY and IN_LAUNDRY items", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const cleanA = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "clean-tee", laundryStatus: "CLEAN", imageKeys: [`u/${userId}/w/c1.jpg`] },
    });
    const cleanB = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "clean-jeans", laundryStatus: "CLEAN", imageKeys: [`u/${userId}/w/c2.jpg`] },
    });
    const dirty = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "dirty-shirt", laundryStatus: "DIRTY", imageKeys: [`u/${userId}/w/d.jpg`] },
    });
    const inLaundry = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "washing-kurta", laundryStatus: "IN_LAUNDRY", imageKeys: [`u/${userId}/w/l.jpg`] },
    });
    const cleanIds = new Set([
      (cleanA.json() as { id: string }).id,
      (cleanB.json() as { id: string }).id,
    ]);
    const dirtyIds = new Set([
      (dirty.json() as { id: string }).id,
      (inLaundry.json() as { id: string }).id,
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/outfits/generate",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { outfit: TodayOutfitResponse["outfit"] };
    expect(body.outfit).not.toBeNull();
    for (const id of body.outfit!.itemIds) {
      expect(cleanIds.has(id)).toBe(true);
      expect(dirtyIds.has(id)).toBe(false);
    }
    expect(body.outfit!.whyThis!.some((s) => /dirty|laundry/i.test(s))).toBe(true);
  });

  it("excludes pieces worn in the last N days (avoid-repeat)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const ids: string[] = [];
    for (const cat of ["tee-a", "jeans-b", "shirt-c", "kurta-d"]) {
      const created = await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category: cat, laundryStatus: "CLEAN", imageKeys: [`u/${userId}/w/${cat}.jpg`] },
      });
      ids.push((created.json() as { id: string }).id);
    }
    for (const id of ids.slice(0, 3)) {
      await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: id },
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/outfits/generate",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { outfit: TodayOutfitResponse["outfit"] };
    expect(body.outfit).not.toBeNull();
    expect(body.outfit!.itemIds).toContain(ids[3]);
    for (const id of ids.slice(0, 3)) {
      expect(body.outfit!.itemIds).not.toContain(id);
    }
    expect(body.outfit!.whyThis!.some((s) => /last \d+ days/i.test(s))).toBe(true);
  });

  it("week calendar CRUD: fill Mon–Sun, patch day, regenerate", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    for (const cat of ["shirt", "jeans", "sneakers", "jacket", "kurta", "shorts", "tee"]) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category: cat, laundryStatus: "CLEAN", imageKeys: [`u/${userId}/w/${cat}.jpg`] },
      });
    }

    const fill = await app.inject({
      method: "POST",
      url: "/outfits/week/generate",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { fillWeek: true },
    });
    expect(fill.statusCode).toBe(200);
    const filled = fill.json() as { days: Array<{ date: string; outfit: { id: string } | null }> };
    expect(filled.days).toHaveLength(7);
    expect(filled.days.every((d) => d.outfit != null)).toBe(true);

    const week = await app.inject({
      method: "GET",
      url: "/outfits/week",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(week.statusCode).toBe(200);
    const weekBody = week.json() as WeekOutfitsResponse;
    expect(weekBody.days).toHaveLength(7);
    expect(weekBody.days[0]!.weekday).toBe("Mon");
    expect(weekBody.days[6]!.weekday).toBe("Sun");
    expect(weekBody.days.filter((d) => d.outfit != null)).toHaveLength(7);

    const targetDate = weekBody.days[2]!.date;
    const wardrobe = await app.inject({
      method: "GET",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const itemIds = (wardrobe.json() as { items: Array<{ id: string }> }).items.slice(0, 2).map((i) => i.id);

    const patched = await app.inject({
      method: "PATCH",
      url: `/outfits/week/${targetDate}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemIds, occasion: "WORK" },
    });
    expect(patched.statusCode).toBe(200);
    const patchedBody = patched.json() as { itemIds: string[]; occasion: string; plannedFor: string };
    expect(patchedBody.plannedFor).toBe(targetDate);
    expect(patchedBody.occasion).toBe("WORK");
    expect(patchedBody.itemIds).toEqual(itemIds);

    const regen = await app.inject({
      method: "POST",
      url: "/outfits/week/generate",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { date: targetDate },
    });
    expect(regen.statusCode).toBe(200);
    const regenBody = regen.json() as {
      days: Array<{ date: string; outfit: { id: string; occasion: string } | null }>;
    };
    expect(regenBody.days[0]!.date).toBe(targetDate);
    expect(regenBody.days[0]!.outfit).not.toBeNull();
  });

  it("weather re-roll regenerates before noon when forecast shifts", async () => {
    stubWeather({ tempC: 30, condition: "sunny" });
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", imageKeys: [`u/${userId}/w/s.jpg`] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", imageKeys: [`u/${userId}/w/j.jpg`] },
    });

    const first = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(first.statusCode).toBe(200);
    const firstId = (first.json() as TodayOutfitResponse).outfit!.id;

    const spy = vi.spyOn(weatherReroll, "shouldRerollOutfitForWeather").mockReturnValue(true);
    const second = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    spy.mockRestore();
    expect(second.statusCode).toBe(200);
    const body = second.json() as TodayOutfitResponse;
    expect(body.weatherRerolled).toBe(true);
    expect(body.generated).toBe(true);
    expect(body.outfit).not.toBeNull();
    expect(body.outfit!.whyThis!.some((s) => /weather/i.test(s))).toBe(true);
    // upsert keeps calendar slot id stable
    expect(body.outfit!.id).toBe(firstId);
  });

  it("GET /outfits/today?alt= returns ranked alternative; select commits it", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    for (const cat of ["a", "b", "c", "d", "e", "f"]) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category: cat, imageKeys: [`u/${userId}/w/${cat}.jpg`] },
      });
    }
    const primary = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(primary.statusCode).toBe(200);
    const pBody = primary.json() as TodayOutfitResponse & { hasMore?: boolean };
    expect(pBody.outfit).not.toBeNull();
    expect(pBody.hasMore).toBe(true);

    const alt = await app.inject({
      method: "GET",
      url: "/outfits/today?alt=1",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(alt.statusCode).toBe(200);
    const aBody = alt.json() as TodayOutfitResponse & { altIndex?: number };
    expect(aBody.altIndex).toBe(1);
    expect(aBody.outfit).not.toBeNull();
    const primaryIds = new Set(pBody.outfit!.itemIds);
    for (const id of aBody.outfit!.itemIds) {
      expect(primaryIds.has(id)).toBe(false);
    }
    // Browsing alternatives (a GET) writes nothing: still just today's one outfit row.
    await app.inject({ method: "GET", url: "/outfits/today?alt=2", headers: { authorization: `Bearer ${accessToken}` } });
    expect(await repos.listOutfits(userId)).toHaveLength(1);

    const select = await app.inject({
      method: "POST",
      url: "/outfits/today/select",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { outfitId: aBody.outfit!.id, alt: 1 },
    });
    expect(select.statusCode).toBe(200);
    const sel = select.json() as { outfit: { itemIds: string[] }; altIndex: number };
    expect(sel.altIndex).toBe(1);
    expect(sel.outfit.itemIds).toEqual(aBody.outfit!.itemIds);

    const todayAgain = await app.inject({
      method: "GET",
      url: "/outfits/today",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const committed = todayAgain.json() as TodayOutfitResponse;
    expect(committed.outfit!.itemIds).toEqual(aBody.outfit!.itemIds);
  });

  it("POST /outfits/travel-pack builds capsule checklist within maxItems", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    for (const cat of ["shirt", "tee", "jeans", "chinos", "sneakers", "rain jacket"]) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category: cat, imageKeys: [`u/${userId}/w/${cat}.jpg`] },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/outfits/travel-pack",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { startDate: "2026-09-01", endDate: "2026-09-03", maxItems: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      nights: number;
      items: unknown[];
      checklist: string;
      constraints: { maxItems: number };
    };
    expect(body.nights).toBe(3);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.constraints.maxItems).toBeLessThanOrEqual(5);
    expect(body.checklist).toContain("- [ ]");
  });

  it("POST /outfits/week/workwear plans unique weekday WORK outfits", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const pieces = [
      "dress shirt",
      "oxford shirt",
      "formal shirt",
      "trousers",
      "chinos",
      "formal pants",
      "loafers",
      "oxford shoes",
      "dress shoes",
      "blazer",
      "dress shirt 2",
      "trousers 2",
      "loafers 2",
      "chinos 2",
      "oxford shirt 2",
    ];
    for (const category of pieces) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category, tags: ["workwear"], imageKeys: [`u/${userId}/w/${category}.jpg`] },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/outfits/week/workwear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { weekStart: "2026-08-24", commit: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      unique: boolean;
      days: Array<{ weekday: string; occasion: string; itemIds: string[] }>;
    };
    expect(body.days.length).toBe(5);
    expect(body.unique).toBe(true);
    expect(body.days.every((d) => d.occasion === "WORK")).toBe(true);
    expect(body.days.every((d) => ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(d.weekday))).toBe(
      true,
    );
  });

  it("POST /outfits/from-calendar maps interview → FORMAL outfit", async () => {
    // The event below is a fixed date; reminders are only set for future events.
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "blazer", imageKeys: [`u/${userId}/w/b.jpg`], garmentImageKey: `u/${userId}/w/b.jpg` },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "trousers", imageKeys: [`u/${userId}/w/t.jpg`], garmentImageKey: `u/${userId}/w/t.jpg` },
    });

    const res = await app.inject({
      method: "POST",
      url: "/outfits/from-calendar",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        events: [
          {
            id: "cal-1",
            title: "Onsite interview",
            startAt: "2026-09-15T09:00:00.000Z",
          },
        ],
        remindNightBefore: true,
        commit: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      events: Array<{
        occasion: string;
        plannedFor: string;
        remindAt: string | null;
        reason: string;
        outfit: { occasion: string | null; plannedFor?: string | null } | null;
      }>;
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]!.occasion).toBe("FORMAL");
    expect(body.events[0]!.plannedFor).toBe("2026-09-15");
    expect(body.events[0]!.remindAt).toBe("2026-09-14T20:00:00.000Z");
    expect(body.events[0]!.outfit?.occasion).toBe("FORMAL");
    expect(body.events[0]!.reason).toMatch(/interview/i);
  });

  it("POST /outfits/wedding-festival plans N day outfits + envelope (N39)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    for (const category of ["lehenga", "saree", "kurta", "heels", "mojari", "sherwani", "gown", "churidar"]) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category, tags: ["wedding", "festive"], imageKeys: [`u/${userId}/w/${category}.jpg`] },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/outfits/wedding-festival",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        startDate: "2026-12-10",
        endDate: "2026-12-12",
        kind: "wedding",
        label: "Weekend wedding",
        budgetLimitMinor: 50_000_00,
        plannedSpendMinor: 20_000_00,
        commit: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      dayCount: number;
      days: Array<{ date: string; occasion: string; itemIds: string[] }>;
      envelope: { status: string; limitMinor: number } | null;
    };
    expect(body.dayCount).toBe(3);
    expect(body.days.length).toBe(3);
    expect(body.days.map((d) => d.date)).toEqual(["2026-12-10", "2026-12-11", "2026-12-12"]);
    expect(body.days.every((d) => d.itemIds.length >= 2)).toBe(true);
    expect(body.envelope?.status).toBe("OK");
    expect(body.envelope?.limitMinor).toBe(50_000_00);
  });

  it("POST /outfits/interview-kit saves look and schedules −1d reminder (N40)", async () => {
    // The interview below is a fixed date; reminders are only set for future ones.
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const createdIds: string[] = [];
    for (const category of ["blazer", "dress shirt", "trousers", "loafers"]) {
      const w = await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category, tags: ["formal"], imageKeys: [`u/${userId}/w/${category}.jpg`] },
      });
      createdIds.push((w.json() as { id: string }).id);
    }
    const eventAt = "2026-10-15T09:00:00.000Z";
    const res = await app.inject({
      method: "POST",
      url: "/outfits/interview-kit",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: "Acme panel",
        kind: "interview",
        itemIds: createdIds.slice(0, 3),
        eventAt,
        remindNightBefore: true,
        commit: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      kit: {
        id: string;
        name: string;
        remindAt: string | null;
        reminderScheduled: boolean;
        occasion: string;
        outfit: { plannedFor?: string | null } | null;
      };
    };
    expect(body.kit.name).toBe("Acme panel");
    expect(body.kit.occasion).toBe("FORMAL");
    expect(body.kit.remindAt).toBe("2026-10-14T20:00:00.000Z");
    expect(body.kit.reminderScheduled).toBe(true);
    expect(body.kit.outfit?.plannedFor).toBe("2026-10-15");

    const list = await app.inject({
      method: "GET",
      url: "/outfits/interview-kit",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { kits: unknown[] }).kits.length).toBeGreaterThanOrEqual(1);

    // W056 — cancel night-before reminder
    const cancel = await app.inject({
      method: "PATCH",
      url: `/outfits/interview-kit/${body.kit.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { cancelReminder: true },
    });
    expect(cancel.statusCode).toBe(200);
    const canceled = cancel.json() as { kit: { remindAt: string | null; reminderScheduled: boolean } };
    expect(canceled.kit.remindAt).toBeNull();
    expect(canceled.kit.reminderScheduled).toBe(false);
  });

  it("today and the week are the user's local days, not UTC's", async () => {
    // 2026-08-30T19:30Z is Sun 30 Aug in UTC but Mon 31 Aug in Kolkata.
    vi.useFakeTimers({ now: new Date("2026-08-30T19:30:00.000Z"), toFake: ["Date"] });
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await repos.setUserTimeZone(userId, "Asia/Kolkata");
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", imageKeys: [] },
    });
    const today = await app.inject({ method: "GET", url: "/outfits/today", headers: { authorization: `Bearer ${accessToken}` } });
    expect((today.json() as TodayOutfitResponse).outfit!.plannedFor).toBe("2026-08-31");
    const week = await app.inject({ method: "GET", url: "/outfits/week", headers: { authorization: `Bearer ${accessToken}` } });
    const days = (week.json() as WeekOutfitsResponse).days;
    expect(days[0]!.date).toBe("2026-08-31");
    expect(days.find((d) => d.isToday)?.date).toBe("2026-08-31");

    // Asking again the same local day reuses the row (no second generation).
    const again = await app.inject({ method: "GET", url: "/outfits/today", headers: { authorization: `Bearer ${accessToken}` } });
    expect((again.json() as TodayOutfitResponse).outfit!.id).toBe((today.json() as TodayOutfitResponse).outfit!.id);
    expect(await repos.listOutfits(userId)).toHaveLength(1);
  });

  it("week PATCH and interview-kit refuse another user's items with 404", async () => {
    const { app } = await buildTestServer();
    const me = await login(app);
    const other = await login(app, "919876543288");
    const theirs = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { category: "blazer", imageKeys: [] },
    });
    const theirId = (theirs.json() as { id: string }).id;
    const patch = await app.inject({
      method: "PATCH",
      url: "/outfits/week/2026-12-01",
      headers: { authorization: `Bearer ${me.accessToken}` },
      payload: { itemIds: [theirId] },
    });
    expect(patch.statusCode).toBe(404);
    const kit = await app.inject({
      method: "POST",
      url: "/outfits/interview-kit",
      headers: { authorization: `Bearer ${me.accessToken}` },
      payload: { name: "Panel", kind: "interview", itemIds: [theirId], eventAt: "2026-12-02T09:00:00.000Z", commit: true },
    });
    expect(kit.statusCode).toBe(404);
  });

  it("wedding-festival spans are capped", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/outfits/wedding-festival",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { startDate: "2026-01-01", endDate: "2027-12-31", kind: "festival" },
    });
    expect(res.statusCode).toBe(400);
  });
});
