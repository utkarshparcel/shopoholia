import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import { socialPollStore } from "../lib/social-poll-store.js";
import {
  resetServerAnalyticsSink,
  setServerAnalyticsSink,
} from "../lib/analytics.js";

describe("social polls N35 / N38", () => {
  beforeEach(() => {
    socialPollStore.clear();
  });

  afterEach(() => {
    socialPollStore.clear();
    resetServerAnalyticsSink();
  });

  it("return poll expires and rejects votes after TTL", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    // Generous TTL so create→first-vote stays valid under loaded CI / parallel agents.
    // Force-expire via store mutation instead of a 50ms race.
    const created = await app.inject({
      method: "POST",
      url: "/polls/return",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemLabel: "navy tee", ttlMs: 60_000 },
    });
    expect(created.statusCode).toBe(201);
    const poll = created.json() as { id: string; deepLink: string };
    expect(poll.deepLink).toContain(`/p/return/${poll.id}`);

    const voteOk = await app.inject({
      method: "POST",
      url: `/polls/return/${poll.id}/vote`,
      payload: { choice: "RETURN", voterKey: "friend-1" },
    });
    expect(voteOk.statusCode).toBe(200);
    expect(voteOk.json().tally).toMatchObject({
      keep: 0,
      return: 1,
      winner: "RETURN",
    });

    const live = socialPollStore.get(poll.id);
    expect(live?.kind).toBe("return");
    if (live) live.expiresAt = new Date(Date.now() - 1);

    const voteLate = await app.inject({
      method: "POST",
      url: `/polls/return/${poll.id}/vote`,
      payload: { choice: "KEEP", voterKey: "friend-2" },
    });
    expect(voteLate.statusCode).toBe(410);

    const get = await app.inject({ method: "GET", url: `/polls/return/${poll.id}` });
    expect(get.statusCode).toBe(200);
    expect(get.json().expired).toBe(true);

    await app.close();
  });

  it("ask-friend tallies votes and applies winner to calendar", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const w1 = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "TOP",
      colors: ["navy"],
      brand: null,
      costMinor: 1000,
      imageKeys: [],
      garmentImageKey: null,
      purchaseItemId: null,
    });
    const w2 = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "BOTTOM",
      colors: ["black"],
      brand: null,
      costMinor: 2000,
      imageKeys: [],
      garmentImageKey: null,
      purchaseItemId: null,
    });
    const w3 = await repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "TOP",
      colors: ["white"],
      brand: null,
      costMinor: 1500,
      imageKeys: [],
      garmentImageKey: null,
      purchaseItemId: null,
    });

    const created = await app.inject({
      method: "POST",
      url: "/polls/outfit",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        plannedFor: "2026-08-28",
        options: [
          { id: "look-a", label: "Navy set", itemIds: [w1.id, w2.id] },
          { id: "look-b", label: "White top", itemIds: [w3.id] },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const poll = created.json() as { id: string; shareText: string };
    expect(poll.shareText).toMatch(/Which look/);

    await app.inject({
      method: "POST",
      url: `/polls/outfit/${poll.id}/vote`,
      payload: { optionId: "look-b", voterKey: "f1" },
    });
    await app.inject({
      method: "POST",
      url: `/polls/outfit/${poll.id}/vote`,
      payload: { optionId: "look-b", voterKey: "f2" },
    });
    const mid = await app.inject({
      method: "POST",
      url: `/polls/outfit/${poll.id}/vote`,
      payload: { optionId: "look-a", voterKey: "f3" },
    });
    expect(mid.json().tally.winnerId).toBe("look-b");

    const applied = await app.inject({
      method: "POST",
      url: `/polls/outfit/${poll.id}/apply-winner`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(applied.statusCode).toBe(200);
    const body = applied.json() as {
      applied: true;
      plannedFor: string;
      winnerId: string;
      outfitId: string;
    };
    expect(body.plannedFor).toBe("2026-08-28");
    expect(body.winnerId).toBe("look-b");

    const slotted = await repos.getOutfitForDate(userId, "2026-08-28");
    expect(slotted?.id).toBe(body.outfitId);
    expect(slotted?.itemIds).toEqual([w3.id]);

    await app.close();
  });
});

describe("N36 family share attribution", () => {
  afterEach(() => {
    resetServerAnalyticsSink();
  });

  it("logs attribution for known referral code", async () => {
    const events: Array<{ name: string; props?: Record<string, unknown> }> = [];
    setServerAnalyticsSink((name, properties) => {
      events.push({ name, props: properties as Record<string, unknown> });
    });

    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await repos.updateUser(userId, { referralCode: "FAM123" });

    const attr = await app.inject({
      method: "POST",
      url: "/referrals/attribute",
      payload: { referralCode: "fam123", source: "family_share" },
    });
    expect(attr.statusCode).toBe(200);
    expect(attr.json()).toMatchObject({
      attributed: true,
      referralCode: "FAM123",
      deepLink: "https://worn.app/r/FAM123",
      landing: {
        headline: expect.stringMatching(/gift card|forgotten/i),
        installCta: expect.stringMatching(/Install/i),
      },
    });
    expect(events.some((e) => e.name === "referral_attribution")).toBe(true);

    const land = await app.inject({ method: "GET", url: "/r/FAM123" });
    expect(land.statusCode).toBe(200);
    expect(land.json().attributed).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/referrals/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.json().referralCode).toBe("FAM123");

    await app.close();
  });
});
