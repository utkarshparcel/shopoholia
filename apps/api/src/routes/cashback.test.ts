import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AFFILIATE_CASHBACK_COINS,
  type CashbackClickResponse,
  type CashbackHistoryResponse,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("MON-AFFILIATE-CLOSET cashback events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes a fresh click id for every play click, whatever the client sends", async () => {
    const { app } = await buildTestServer();
    const alice = await login(app, "919800000001");
    const bob = await login(app, "919800000002");
    const listingId = randomUUID();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-10T10:00:00Z"));
    const click = (accessToken: string, clickId?: string) =>
      app.inject({
        method: "POST",
        url: "/cashback/click",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { listingId, platform: "myntra", ...(clickId ? { clickId } : {}) },
      });

    const a = (await click(alice.accessToken)).json() as CashbackClickResponse;
    // Same listing, same millisecond.
    const b = (await click(bob.accessToken)).json() as CashbackClickResponse;
    // A client-chosen id, such as someone else's.
    const squat = (await click(bob.accessToken, a.clickId)).json() as CashbackClickResponse;

    expect(a.clickId.startsWith(`play:${listingId}:`)).toBe(true);
    expect(new Set([a.clickId, b.clickId, squat.clickId]).size).toBe(3);
    expect((await app.deps.repos.listCashbackEvents(alice.userId)).map((e) => e.clickId)).toEqual([a.clickId]);
    expect((await app.deps.repos.listCashbackEvents(bob.userId)).map((e) => e.clickId).sort()).toEqual(
      [b.clickId, squat.clickId].sort(),
    );
  });

  it("records Closet vault Use it now click without listingId", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const res = await app.inject({
      method: "POST",
      url: "/cashback/click",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        source: "vault_use_it_now",
        platform: "amazon",
        url: "https://www.amazon.in/?tag=shopoholia-21",
        clickId: "closet-vault-amazon-1",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CashbackClickResponse;
    expect(body).toMatchObject({
      recorded: true,
      source: "vault_use_it_now",
      platform: "amazon",
      listingId: null,
    });
    // The server makes the click id; one the client sends is ignored.
    expect(body.clickId).toMatch(/^closet:vault_use_it_now:amazon:/);

    const events = await app.deps.repos.listCashbackEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      clickId: body.clickId,
      platform: "amazon",
      listingId: null,
      status: "PENDING",
    });

    const me = await app.inject({
      method: "GET",
      url: "/cashback/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    const history = me.json() as CashbackHistoryResponse;
    expect(history.events.some((e) => e.platform === "amazon" && e.listingId === null)).toBe(true);
  });

  it("records Closet missing_piece click and auto-builds clickId", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const res = await app.inject({
      method: "POST",
      url: "/cashback/click",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        source: "missing_piece",
        platform: "myntra",
        url: "https://www.myntra.com/black-trousers?ref=shopoholia",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CashbackClickResponse;
    expect(body.recorded).toBe(true);
    expect(body.source).toBe("missing_piece");
    expect(body.clickId).toMatch(/^closet:missing_piece:myntra:/);

    const events = await app.deps.repos.listCashbackEvents(userId);
    expect(events.some((e) => e.clickId === body.clickId && e.platform === "myntra")).toBe(true);
  });

  it("requires listingId for play_listing clicks", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/cashback/click",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { platform: "myntra" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("pays a click once when the network's webhook repeats or races", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const click = () =>
      app.inject({
        method: "POST",
        url: "/cashback/click",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { source: "missing_piece", platform: "myntra", clickId: "net-click-1" },
      });
    const { clickId } = (await click()).json() as CashbackClickResponse;
    const before = await app.deps.repos.getCoinBalance(userId);

    const webhook = () =>
      app.inject({
        method: "POST",
        url: "/cashback/webhook",
        payload: { clickId, status: "CONFIRMED" },
      });
    const results = await Promise.all([webhook(), webhook(), webhook()]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    // The same click again, then the webhook again: the confirmed event is not reopened.
    expect((await click()).statusCode).toBe(200);
    expect((await webhook()).statusCode).toBe(200);

    expect(await app.deps.repos.getCoinBalance(userId)).toBe(before + AFFILIATE_CASHBACK_COINS);
    const me = (
      await app.inject({
        method: "GET",
        url: "/cashback/me",
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json() as CashbackHistoryResponse;
    expect(me.totalEarned).toBe(AFFILIATE_CASHBACK_COINS);
  });
});
