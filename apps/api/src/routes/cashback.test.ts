import { describe, expect, it } from "vitest";
import type { CashbackClickResponse, CashbackHistoryResponse } from "@worn/shared";
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
});
