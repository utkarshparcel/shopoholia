import { describe, expect, it } from "vitest";
import type { DisposeResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("waste share card + wear challenge", () => {
  it("GET /waste/summary includes shareCard with blurred merchants", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "shirt",
        brand: "Myntra",
        costMinor: 2_500_00,
        colors: ["navy"],
      },
    });
    expect(created.statusCode).toBe(201);

    // Age metric into DEAD via upsert after create (memory marks by age; force status)
    const summary = await app.inject({
      method: "GET",
      url: "/waste/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json() as {
      neverWornCostMinor: number;
      shareCard: {
        headline: string;
        blurredMerchants: string[];
        watermark: string;
        shareText: string;
        neverWornCostMinor: number;
      };
      metrics: Array<{ wearChallenge?: { eligible: boolean; progress: number; target: number } }>;
    };
    expect(body.neverWornCostMinor).toBe(2_500_00);
    expect(body.shareCard.neverWornCostMinor).toBe(2_500_00);
    expect(body.shareCard.watermark).toBe("worn.app");
    expect(body.shareCard.headline).toMatch(/never worn/);
    expect(body.shareCard.blurredMerchants.some((m) => m.includes("•"))).toBe(true);
    expect(body.shareCard.shareText).not.toContain("Myntra");
    expect(body.metrics[0]?.wearChallenge?.target).toBe(3);
  });

  it("POST /waste/:itemId/challenge starts wear-3× and queues push", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", brand: "FabIndia", costMinor: 1_000_00, colors: ["cream"] },
    });
    const itemId = (created.json() as { id: string }).id;

    const start = await app.inject({
      method: "POST",
      url: `/waste/${itemId}/challenge`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as {
      wardrobeItemId: string;
      wearChallenge: { progress: number; target: number; eligible: boolean; completed: boolean };
      pushQueued: boolean;
    };
    expect(started.wardrobeItemId).toBe(itemId);
    expect(started.wearChallenge.target).toBe(3);
    expect(started.wearChallenge.progress).toBe(0);
    expect(started.wearChallenge.completed).toBe(false);
    expect(started.pushQueued).toBe(true);

    const events = await app.deps.push.listEvents(userId);
    expect(events.some((e) => e.eventType === "WEAR_CHALLENGE")).toBe(true);

    // Complete challenge via 3 wears → conflict on re-start
    for (let i = 0; i < 3; i++) {
      const wear = await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: itemId },
      });
      expect(wear.statusCode).toBe(201);
    }

    const again = await app.inject({
      method: "POST",
      url: `/waste/${itemId}/challenge`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(again.statusCode).toBe(409);
  });

  it("dead items expose wearChallenge and dispose still works", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", brand: "Levis", costMinor: 3_000_00, colors: ["blue"] },
    });
    const itemId = (created.json() as { id: string }).id;

    await repos.upsertItemMetric({
      userId,
      wardrobeItemId: itemId,
      wearCount: 0,
      lastWornAt: new Date(Date.now() - 100 * 86_400_000),
      costPerWearMinor: 3_000_00,
      status: "DEAD",
    });

    const dead = await app.inject({
      method: "GET",
      url: "/waste/dead",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(dead.statusCode).toBe(200);
    const items = (dead.json() as { items: Array<{ wearChallenge: { eligible: boolean; label: string } }> }).items;
    expect(items[0]?.wearChallenge.eligible).toBe(true);
    expect(items[0]?.wearChallenge.label).toBe("0/3 wears");

    const dispose = await app.inject({
      method: "POST",
      url: `/waste/${itemId}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "SELL" },
    });
    expect(dispose.statusCode).toBe(200);
    expect((dispose.json() as DisposeResponse).listingId).toBeTruthy();
  });

  it("GET /waste/rewear-streak counts consecutive wear days", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "tee", brand: "Uniqlo", costMinor: 800_00, colors: ["white"] },
    });
    const itemId = (created.json() as { id: string }).id;

    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    for (const wornOn of [yesterday, today]) {
      const wear = await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: itemId, wornOn: wornOn.toISOString() },
      });
      expect(wear.statusCode).toBe(201);
    }

    const streakRes = await app.inject({
      method: "GET",
      url: "/waste/rewear-streak",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(streakRes.statusCode).toBe(200);
    const streak = streakRes.json() as {
      currentStreak: number;
      todayLogged: boolean;
      label: string;
      brokenByPurchase: boolean;
    };
    expect(streak.currentStreak).toBeGreaterThanOrEqual(2);
    expect(streak.todayLogged).toBe(true);
    expect(streak.brokenByPurchase).toBe(false);
    expect(streak.label).toMatch(/rewear streak/);

    const summary = await app.inject({
      method: "GET",
      url: "/waste/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    expect((summary.json() as { rewearStreak: { currentStreak: number } }).rewearStreak.currentStreak).toBe(
      streak.currentStreak,
    );
  });

  it("GET /waste/summary includes co2WaterSavings from rewears", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", brand: "Uniqlo", costMinor: 1_000_00, colors: ["white"] },
    });
    const itemId = (created.json() as { id: string }).id;
    for (let i = 0; i < 3; i++) {
      const wear = await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: itemId },
      });
      expect(wear.statusCode).toBe(201);
    }

    const summary = await app.inject({
      method: "GET",
      url: "/waste/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const body = summary.json() as {
      co2WaterSavings: {
        rewearCount: number;
        kgCo2Saved: number;
        litersWaterSaved: number;
        label: string;
      };
    };
    expect(body.co2WaterSavings.rewearCount).toBeGreaterThanOrEqual(2);
    expect(body.co2WaterSavings.kgCo2Saved).toBeGreaterThan(0);
    expect(body.co2WaterSavings.litersWaterSaved).toBeGreaterThan(0);
    expect(body.co2WaterSavings.label).toMatch(/CO₂/);
  });
});
