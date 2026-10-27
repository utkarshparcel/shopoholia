import {
  tallyAskFriendVotes,
  tallyReturnVotes,
  type AskFriendOption,
  type ReturnPollChoice,
} from "@worn/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import { tallyAskFriendCounts, tallyReturnCounts } from "../lib/social-poll-store.js";
import {
  resetServerAnalyticsSink,
  setServerAnalyticsSink,
} from "../lib/analytics.js";

function tokenFrom(deepLink: string): string {
  return deepLink.split("/").pop()!;
}

describe("social polls N35 / N38", () => {
  afterEach(() => {
    resetServerAnalyticsSink();
  });

  it("return poll expires and rejects votes after TTL", async () => {
    const { app, repos } = await buildTestServer();
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
    // The link carries an unguessable token, not the poll id.
    expect(poll.deepLink).not.toContain(poll.id);
    const token = tokenFrom(poll.deepLink);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const voteOk = await app.inject({
      method: "POST",
      url: `/polls/public/return/${token}/vote`,
      payload: { choice: "RETURN", voterKey: "friend-1" },
    });
    expect(voteOk.statusCode).toBe(200);
    expect(voteOk.json().tally).toMatchObject({
      keep: 0,
      return: 1,
      winner: "RETURN",
    });
    // The friend view has no ids.
    expect(Object.keys(voteOk.json()).sort()).toEqual(["expired", "expiresAt", "itemLabel", "kind", "tally"]);

    // Force-expire in the store instead of a 50ms race.
    const live = await repos.findSocialPollById(poll.id);
    expect(live?.kind).toBe("return");
    if (live) live.expiresAt = new Date(Date.now() - 1);

    const voteLate = await app.inject({
      method: "POST",
      url: `/polls/public/return/${token}/vote`,
      payload: { choice: "KEEP", voterKey: "friend-2" },
    });
    expect(voteLate.statusCode).toBe(410);

    const get = await app.inject({
      method: "GET",
      url: `/polls/return/${poll.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().expired).toBe(true);

    await app.close();
  });

  it("by-id routes need auth and ownership; a forged token is 404", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app);
    const other = await login(app, "919876500001");
    const created = await app.inject({
      method: "POST",
      url: "/polls/return",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { itemLabel: "navy tee" },
    });
    const { id } = created.json() as { id: string };

    const anon = await app.inject({ method: "GET", url: `/polls/return/${id}` });
    expect(anon.statusCode).toBe(401);
    const peek = await app.inject({
      method: "GET",
      url: `/polls/return/${id}`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(peek.statusCode).toBe(404);
    const anonVote = await app.inject({
      method: "POST",
      url: `/polls/return/${id}/vote`,
      payload: { choice: "KEEP" },
    });
    expect(anonVote.statusCode).toBe(401);
    const forged = await app.inject({
      method: "GET",
      url: `/polls/public/return/${"A".repeat(43)}`,
    });
    expect(forged.statusCode).toBe(404);
    await app.close();
  });

  it("one vote per voter: a retry is 200, a changed vote is 400", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/polls/return",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemLabel: "navy tee" },
    });
    const token = tokenFrom((created.json() as { deepLink: string }).deepLink);
    const vote = (choice: string, voterKey?: string) =>
      app.inject({
        method: "POST",
        url: `/polls/public/return/${token}/vote`,
        payload: voterKey ? { choice, voterKey } : { choice },
      });
    const [a, b] = await Promise.all([vote("KEEP", "f1"), vote("KEEP", "f1")]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(b.json().tally.total).toBe(1);
    const changed = await vote("RETURN", "f1");
    expect(changed.statusCode).toBe(400);
    // Without a device key the voter is keyed by IP, so it cannot vote twice either.
    expect((await vote("RETURN")).statusCode).toBe(200);
    expect((await vote("KEEP")).statusCode).toBe(400);
    const final = await app.inject({ method: "GET", url: `/polls/public/return/${token}` });
    expect(final.json().tally).toMatchObject({ keep: 1, return: 1, total: 2, winner: null });
    await app.close();
  });

  it("count tallies match the vote-list tallies", () => {
    const options: AskFriendOption[] = [
      { id: "a", label: "A", itemIds: [] },
      { id: "b", label: "B", itemIds: [] },
      { id: "c", label: "C", itemIds: [] },
    ];
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 200; round++) {
      const n = Math.floor(rand() * 8);
      const returnVotes = Array.from({ length: n }, () => ({
        choice: (rand() < 0.5 ? "KEEP" : "RETURN") as ReturnPollChoice,
      }));
      const outfitVotes = Array.from({ length: n }, () => ({
        optionId: options[Math.floor(rand() * 3)]!.id,
      }));
      const rc: Record<string, number> = {};
      for (const v of returnVotes) rc[v.choice] = (rc[v.choice] ?? 0) + 1;
      const oc: Record<string, number> = {};
      for (const v of outfitVotes) oc[v.optionId] = (oc[v.optionId] ?? 0) + 1;
      expect(tallyReturnCounts(rc)).toEqual(tallyReturnVotes(returnVotes));
      expect(tallyAskFriendCounts(options, oc)).toEqual(tallyAskFriendVotes(options, outfitVotes));
    }
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
    const poll = created.json() as { id: string; shareText: string; deepLink: string };
    expect(poll.shareText).toMatch(/Which look/);
    const token = tokenFrom(poll.deepLink);

    const view = await app.inject({ method: "GET", url: `/polls/public/outfit/${token}` });
    expect(view.statusCode).toBe(200);
    // Friends see labels, never wardrobe item ids.
    expect(JSON.stringify(view.json())).not.toContain(w1.id);

    await app.inject({
      method: "POST",
      url: `/polls/public/outfit/${token}/vote`,
      payload: { optionId: "look-b", voterKey: "f1" },
    });
    await app.inject({
      method: "POST",
      url: `/polls/public/outfit/${token}/vote`,
      payload: { optionId: "look-b", voterKey: "f2" },
    });
    const mid = await app.inject({
      method: "POST",
      url: `/polls/public/outfit/${token}/vote`,
      payload: { optionId: "look-a", voterKey: "f3" },
    });
    expect(mid.json().tally.winnerId).toBe("look-b");
    const bad = await app.inject({
      method: "POST",
      url: `/polls/public/outfit/${token}/vote`,
      payload: { optionId: "look-z", voterKey: "f4" },
    });
    expect(bad.statusCode).toBe(400);

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
    expect((applied.json() as { poll: { winnerAppliedAt: string | null } }).poll.winnerAppliedAt).not.toBeNull();

    await app.close();
  });

  it("plannedFor defaults to today in the user's time zone", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await repos.setUserTimeZone(userId, "Pacific/Kiritimati");
    const created = await app.inject({
      method: "POST",
      url: "/polls/outfit",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        options: [
          { label: "A", itemIds: ["00000000-0000-4000-8000-000000000001"] },
          { label: "B", itemIds: ["00000000-0000-4000-8000-000000000002"] },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Kiritimati",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(created.json().plannedFor).toBe(expected);
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
