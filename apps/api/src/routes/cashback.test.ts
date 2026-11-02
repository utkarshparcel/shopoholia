import { describe, expect, it } from "vitest";
import {
  AFFILIATE_CASHBACK_COINS,
  type CashbackClickResponse,
  type CashbackHistoryResponse,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("MON-AFFILIATE-CLOSET cashback events", () => {
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
      clickId: "closet-vault-amazon-1",
      source: "vault_use_it_now",
      platform: "amazon",
      listingId: null,
    });

    const events = await app.deps.repos.listCashbackEvents(userId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      clickId: "closet-vault-amazon-1",
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
