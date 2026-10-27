import { describe, it, expect } from "vitest";
import type {
  FestivalsResponse,
  GiftOrder,
  Recipient,
  RecipientIdeasResponse,
  RecipientsResponse,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

async function seedListing(
  repos: Awaited<ReturnType<typeof buildTestServer>>["repos"],
  opts: {
    id?: string;
    title?: string;
    category?: string;
    tags?: string[];
    affiliateUrl?: string | null;
  } = {},
) {
  const id = opts.id ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await repos.seedListings(
    [
      {
        id,
        sellerId: null,
        title: opts.title ?? "Silk Saree",
        category: opts.category ?? "APPAREL",
        tags: opts.tags ?? ["saree"],
        coinPrice: 200,
        realPrice: "₹3,999",
        productImageKeys: ["img/saree.jpg"],
        houseModelRenderKey: "house/saree.jpg",
        affiliateUrl: opts.affiliateUrl === undefined ? "https://www.myntra.com/saree" : opts.affiliateUrl,
        affiliateLinks: null,
        status: "ACTIVE",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ],
    [],
  );
  return id;
}

describe("gifts", () => {
  it("creates and lists recipients", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Mom", relationship: "FAMILY", region: "IN", profile: { tasteTags: ["saree","kurta"], importantDates: [{ occasion: "BIRTHDAY", date: new Date(Date.now()+10*86400000).toISOString() }] } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Recipient;
    expect(body.name).toBe("Mom");
    const list = await app.inject({ method: "GET", url: "/recipients", headers: { authorization: `Bearer ${accessToken}` } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as RecipientsResponse).recipients.length).toBe(1);
  });

  it("creates recipient without profile defaults relationship/region", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Cousin" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Recipient;
    expect(body.relationship).toBe("OTHER");
    expect(body.region).toBe("IN");
    // Empty profile shell is always created (sizes/tags empty) so ideas/reminders share one path.
    expect(body.profile).toMatchObject({
      tasteTags: [],
      wishlist: [],
      importantDates: [],
      notes: null,
    });
    expect(body.nextOccasionDate).toBeNull();
    expect(body.daysUntil).toBeNull();
  });

  it("returns gift ideas filtered by taste", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken } = await login(app);
    await seedListing(repos, { tags: ["saree", "silk"], category: "APPAREL" });
    await seedListing(repos, {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Running Shoes",
      tags: ["sneakers"],
      category: "FOOTWEAR",
      affiliateUrl: "https://www.flipkart.com/shoes",
    });
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Sister", profile: { tasteTags: ["saree"] } },
    });
    const recId = (rec.json() as Recipient).id;
    const ideas = await app.inject({ method: "GET", url: `/recipients/${recId}/ideas`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(ideas.statusCode).toBe(200);
    const j = ideas.json() as RecipientIdeasResponse;
    expect(j.recipientId).toBe(recId);
    expect(j.ideas.length).toBeGreaterThan(0);
    expect(j.ideas.length).toBeLessThanOrEqual(3);
    expect(j.ideas[0]!.title).toBe("Silk Saree");
    expect(j.ideas[0]!.reason).toMatch(/Matches saree/i);
    expect(j.ideas.every((i) => i.title !== "Running Shoes")).toBe(true);
  });

  it("ranks at most 3 ideas within budgetCap", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken } = await login(app);
    await repos.seedListings(
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
          sellerId: null,
          title: "Budget Kurta",
          category: "APPAREL",
          tags: ["kurta"],
          coinPrice: 40,
          realPrice: "₹799",
          productImageKeys: [],
          houseModelRenderKey: "",
          affiliateUrl: "https://www.myntra.com/kurta",
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 0,
          createdAt: new Date(),
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
          sellerId: null,
          title: "Mid Kurta",
          category: "APPAREL",
          tags: ["kurta"],
          coinPrice: 70,
          realPrice: "₹1,499",
          productImageKeys: [],
          houseModelRenderKey: "",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 1,
          createdAt: new Date(),
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
          sellerId: null,
          title: "Luxury Kurta",
          category: "APPAREL",
          tags: ["kurta"],
          coinPrice: 120,
          realPrice: "₹4,999",
          productImageKeys: [],
          houseModelRenderKey: "",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 2,
          createdAt: new Date(),
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04",
          sellerId: null,
          title: "Silk Saree",
          category: "APPAREL",
          tags: ["saree"],
          coinPrice: 55,
          realPrice: "₹2,999",
          productImageKeys: [],
          houseModelRenderKey: "",
          affiliateUrl: null,
          affiliateLinks: null,
          status: "ACTIVE",
          sortOrder: 3,
          createdAt: new Date(),
        },
      ],
      [],
    );
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Mom", profile: { tasteTags: ["kurta", "saree"] } },
    });
    const recId = (rec.json() as Recipient).id;
    const ideas = await app.inject({
      method: "GET",
      url: `/recipients/${recId}/ideas?budgetCap=80`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ideas.statusCode).toBe(200);
    const j = ideas.json() as RecipientIdeasResponse;
    expect(j.budgetCap).toBe(80);
    expect(j.ideas).toHaveLength(3);
    expect(j.ideas.every((i) => i.coinPrice <= 80)).toBe(true);
    expect(j.ideas.every((i) => i.title !== "Luxury Kurta")).toBe(true);
  });

  it("returns popular picks when recipient has no taste tags", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken } = await login(app);
    await seedListing(repos);
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Friend" },
    });
    const recId = (rec.json() as Recipient).id;
    const ideas = await app.inject({
      method: "GET",
      url: `/recipients/${recId}/ideas`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ideas.statusCode).toBe(200);
    const j = ideas.json() as RecipientIdeasResponse;
    expect(j.ideas.length).toBeGreaterThan(0);
    expect(j.ideas.length).toBeLessThanOrEqual(3);
    expect(j.ideas[0]!.reason).toBe("Popular pick");
  });

  it("404s gift ideas for unknown recipient", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const ideas = await app.inject({
      method: "GET",
      url: "/recipients/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ideas",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ideas.statusCode).toBe(404);
  });

  it("creates gift order with affiliate link and cashback", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const rec = await app.inject({ method: "POST", url: "/recipients", headers: { authorization: `Bearer ${accessToken}` }, payload: { name: "Friend" } });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recipientId: recId, occasion: "FESTIVAL", affiliateLink: "https://amazon.in/kurta" },
    });
    expect(gift.statusCode).toBe(201);
    const g = gift.json() as GiftOrder;
    expect(g.recipientId).toBe(recId);
    expect(g.affiliateLink ?? "").toContain("amazon");
  });

  it("records cashback when ordering from a listing affiliate URL", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const listingId = await seedListing(repos, {
      affiliateUrl: "https://www.flipkart.com/gift-kurta",
    });
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Uncle" },
    });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recipientId: recId, listingId, occasion: "BIRTHDAY" },
    });
    expect(gift.statusCode).toBe(201);
    const g = gift.json() as GiftOrder;
    expect(g.listingId).toBe(listingId);
    expect(g.affiliateLink).toContain("flipkart");
    const events = await repos.listCashbackEvents(userId);
    expect(events.length).toBe(1);
    expect(events[0]!.platform).toBe("flipkart");
    expect(events[0]!.listingId).toBe(listingId);
  });

  it("classifies affiliate platforms and invalid URLs when recording cashback", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Aunt" },
    });
    const recId = (rec.json() as Recipient).id;

    const cases: Array<{ id: string; url: string; platform: string }> = [
      { id: "11111111-1111-4111-8111-111111111111", url: "https://www.amazon.in/x", platform: "amazon" },
      { id: "22222222-2222-4222-8222-222222222222", url: "https://www.myntra.com/x", platform: "myntra" },
      { id: "33333333-3333-4333-8333-333333333333", url: "https://www.ajio.com/x", platform: "ajio" },
      { id: "44444444-4444-4444-8444-444444444444", url: "https://www.nykaa.com/x", platform: "nykaa" },
      { id: "55555555-5555-4555-8555-555555555555", url: "https://example.com/x", platform: "other" },
      { id: "66666666-6666-4666-8666-666666666666", url: "not-a-valid-url", platform: "other" },
    ];

    for (const c of cases) {
      await seedListing(repos, { id: c.id, affiliateUrl: c.url, title: c.platform });
      const gift = await app.inject({
        method: "POST",
        url: "/gifts",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { recipientId: recId, listingId: c.id },
      });
      expect(gift.statusCode).toBe(201);
    }

    const events = await repos.listCashbackEvents(userId);
    const platforms = events.map((e) => e.platform).sort();
    expect(platforms).toEqual(["ajio", "amazon", "myntra", "nykaa", "other", "other"].sort());
  });

  it("orders from listing without affiliate when no link provided", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const listingId = await seedListing(repos, { affiliateUrl: null });
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Neighbor" },
    });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recipientId: recId, listingId },
    });
    expect(gift.statusCode).toBe(201);
    expect((gift.json() as GiftOrder).affiliateLink).toBeNull();
    expect(await repos.listCashbackEvents(userId)).toHaveLength(0);
  });

  it("404s gift order for missing recipient or listing", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const missingRecipient = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        recipientId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        affiliateLink: "https://amazon.in/x",
      },
    });
    expect(missingRecipient.statusCode).toBe(404);

    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Pal" },
    });
    const recId = (rec.json() as Recipient).id;
    const missingListing = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        recipientId: recId,
        listingId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    });
    expect(missingListing.statusCode).toBe(404);
  });

  it("lists gift orders for the user", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Friend" },
    });
    const recId = (rec.json() as Recipient).id;
    await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recipientId: recId, occasion: "ANNIVERSARY", affiliateLink: "https://amazon.in/gift" },
    });
    const list = await app.inject({
      method: "GET",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const gifts = (list.json() as { gifts: GiftOrder[] }).gifts;
    expect(gifts).toHaveLength(1);
    expect(gifts[0]!.recipientId).toBe(recId);
    expect(gifts[0]!.occasion).toBe("ANNIVERSARY");
    expect(gifts[0]!.status).toBe("ORDERED");
  });

  it("returns daysUntil / nextOccasion on recipients", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const in10 = new Date(Date.now() + 10 * 86400000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: "Mom",
        relationship: "FAMILY",
        region: "IN",
        profile: {
          tasteTags: ["saree"],
          importantDates: [
            { occasion: "FESTIVAL", date: in10, label: "Diwali" },
            { occasion: "BIRTHDAY", date: new Date(Date.now() + 40 * 86400000).toISOString(), label: "Birthday" },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Recipient;
    expect(body.nextOccasionLabel).toBe("Diwali");
    expect(typeof body.daysUntil).toBe("number");
    expect(body.daysUntil).toBeGreaterThanOrEqual(9);
    expect(body.daysUntil).toBeLessThanOrEqual(11);
    expect(body.nextOccasionDate).toBeTruthy();

    const list = await app.inject({
      method: "GET",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const r = (list.json() as RecipientsResponse).recipients[0]!;
    expect(r.daysUntil).toBe(body.daysUntil);
    expect(r.nextOccasionLabel).toBe("Diwali");
  });

  it("seeds IN festival dates via /gifts/festivals", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/gifts/festivals?region=IN",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const j = res.json() as FestivalsResponse;
    expect(j.region).toBe("IN");
    expect(j.festivals.length).toBeGreaterThan(0);
    expect(j.festivals.some((f) => f.label === "Diwali")).toBe(true);
  });

  it("defaults festival region to IN and seeds US/UK packs (U048)", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const def = await app.inject({
      method: "GET",
      url: "/gifts/festivals",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(def.statusCode).toBe(200);
    expect((def.json() as FestivalsResponse).region).toBe("IN");
    expect((def.json() as FestivalsResponse).festivals.length).toBeGreaterThan(0);

    const us = await app.inject({
      method: "GET",
      url: "/gifts/festivals?region=US",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(us.statusCode).toBe(200);
    const body = us.json() as FestivalsResponse;
    expect(body.region).toBe("US");
    expect(body.festivals.some((f) => /Thanksgiving/i.test(f.label))).toBe(true);
  });

  it("requires auth on gift routes", async () => {
    const { app } = await buildTestServer();
    for (const [method, url, payload] of [
      ["GET", "/recipients", undefined],
      ["POST", "/recipients", { name: "X" }],
      ["GET", "/gifts", undefined],
      [
        "POST",
        "/gifts",
        { recipientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
      ["GET", "/gifts/festivals", undefined],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        payload,
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it("stores wishlist refs and creates gift with wrap + group contribute", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        name: "Aunt",
        relationship: "FAMILY",
        profile: {
          wishlist: [
            { title: "Silk scarf", url: "https://example.com/scarf", note: "prefer blue" },
            "legacy string wish",
          ],
        },
      },
    });
    expect(rec.statusCode).toBe(201);
    const recipient = rec.json() as Recipient;
    expect(recipient.profile?.wishlist?.length).toBe(2);
    expect(recipient.profile?.wishlist?.[0]?.title).toBe("Silk scarf");
    expect(recipient.profile?.wishlist?.[0]?.url).toContain("example.com");
    expect(recipient.profile?.wishlist?.[1]?.title).toBe("legacy string wish");

    const wishPut = await app.inject({
      method: "PUT",
      url: `/recipients/${recipient.id}/wishlist`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        wishlist: [{ title: "Tea set", listingId: null, url: null, note: "ceramic" }],
      },
    });
    expect(wishPut.statusCode).toBe(200);
    expect((wishPut.json() as Recipient).profile?.wishlist?.[0]?.title).toBe("Tea set");

    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        recipientId: recipient.id,
        occasion: "BIRTHDAY",
        wrapMessage: "Happy birthday — from all of us!",
        groupTargetMinor: 500000,
        groupCurrency: "INR",
      },
    });
    expect(gift.statusCode).toBe(201);
    const g = gift.json() as GiftOrder;
    expect(g.wrapMessage).toBe("Happy birthday — from all of us!");
    expect(g.groupTargetMinor).toBe(500000);
    expect(g.groupCurrency).toBe("INR");

    const contribute = await app.inject({
      method: "POST",
      url: `/gifts/${g.id}/contribute`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { amountMinor: 150000, note: "chip in", contributorName: "Cousin" },
    });
    expect(contribute.statusCode).toBe(201);
    const body = contribute.json() as {
      contribution: { amountMinor: number; contributorName: string | null };
      gift: GiftOrder;
    };
    expect(body.contribution.amountMinor).toBe(150000);
    expect(body.contribution.contributorName).toBe("Cousin");
    expect(body.gift.contributedMinor).toBe(150000);

    const detail = await app.inject({
      method: "GET",
      url: `/gifts/${g.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const d = detail.json() as { gift: GiftOrder; contributions: Array<{ amountMinor: number }> };
    expect(d.gift.wrapMessage).toContain("Happy birthday");
    expect(d.contributions.length).toBe(1);
    expect(d.gift.contributedMinor).toBe(150000);
  });

  it("rejects contribute on non-group gifts and missing orders", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "Pal" },
    });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { recipientId: recId, affiliateLink: "https://amazon.in/solo" },
    });
    expect(gift.statusCode).toBe(201);
    const giftId = (gift.json() as GiftOrder).id;

    const notGroup = await app.inject({
      method: "POST",
      url: `/gifts/${giftId}/contribute`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { amountMinor: 1000 },
    });
    expect(notGroup.statusCode).toBe(400);
    expect((notGroup.json() as { message: string }).message).toMatch(/not a group gift/i);

    const missing = await app.inject({
      method: "POST",
      url: "/gifts/dddddddd-dddd-4ddd-8ddd-dddddddddddd/contribute",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { amountMinor: 1000 },
    });
    expect(missing.statusCode).toBe(404);

    const detailMissing = await app.inject({
      method: "GET",
      url: "/gifts/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(detailMissing.statusCode).toBe(404);
  });

  it("lists group gifts with contributedMinor summed", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const rec = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "GroupTarget" },
    });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        recipientId: recId,
        groupTargetMinor: 10_000,
        groupCurrency: "INR",
        wrapMessage: "pool",
      },
    });
    const giftId = (gift.json() as GiftOrder).id;
    await app.inject({
      method: "POST",
      url: `/gifts/${giftId}/contribute`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { amountMinor: 2500 },
    });
    const list = await app.inject({
      method: "GET",
      url: "/gifts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const row = (list.json() as { gifts: GiftOrder[] }).gifts.find((g) => g.id === giftId);
    expect(row?.groupTargetMinor).toBe(10_000);
    expect(row?.contributedMinor).toBe(2500);
  });

  it("contribute: a retried tap with the same key adds once; another user's gift is 404", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const auth = { authorization: `Bearer ${accessToken}` };
    const rec = await app.inject({ method: "POST", url: "/recipients", headers: auth, payload: { name: "Pool" } });
    const recId = (rec.json() as Recipient).id;
    const gift = await app.inject({
      method: "POST",
      url: "/gifts",
      headers: auth,
      payload: { recipientId: recId, groupTargetMinor: 10_000, groupCurrency: "INR" },
    });
    const giftId = (gift.json() as GiftOrder).id;
    const idempotencyKey = "6f1c2a52-8e8a-4c55-9a51-2b7f4f0c9d11";
    const tap = () =>
      app.inject({
        method: "POST",
        url: `/gifts/${giftId}/contribute`,
        headers: auth,
        payload: { amountMinor: 1500, idempotencyKey },
      });
    const [a, b] = await Promise.all([tap(), tap()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    const again = await tap();
    expect(again.statusCode).toBe(200);
    type Body = { contribution: { id: string }; gift: GiftOrder };
    expect((again.json() as Body).contribution.id).toBe((a.json() as Body).contribution.id);
    expect((again.json() as Body).gift.contributedMinor).toBe(1500);

    const other = await login(app, "919876500031");
    const foreign = await app.inject({
      method: "POST",
      url: `/gifts/${giftId}/contribute`,
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { amountMinor: 100 },
    });
    expect(foreign.statusCode).toBe(404);
    const detail = await app.inject({ method: "GET", url: `/gifts/${giftId}`, headers: auth });
    expect((detail.json() as Body).gift.contributedMinor).toBe(1500);
  });

  it("serializes recipient with profile null when profile row is missing", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/recipients",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: "OrphanProfile" },
    });
    expect(created.statusCode).toBe(201);
    const recId = (created.json() as Recipient).id;

    const origFind = repos.findRecipientProfile.bind(repos);
    const origList = repos.listRecipientProfiles.bind(repos);
    repos.findRecipientProfile = async () => null;
    repos.listRecipientProfiles = async () => [];
    try {
      const list = await app.inject({
        method: "GET",
        url: "/recipients",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(list.statusCode).toBe(200);
      const row = (list.json() as RecipientsResponse).recipients.find((r) => r.id === recId);
      expect(row).toBeTruthy();
      expect(row!.profile).toBeNull();
      expect(row!.nextOccasionDate).toBeNull();
      expect(row!.daysUntil).toBeNull();

      const one = await app.inject({
        method: "GET",
        url: `/recipients/${recId}/ideas`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      // Ideas still 200 with empty taste (profile null → taste []).
      expect(one.statusCode).toBe(200);

      const wish404 = await app.inject({
        method: "PUT",
        url: "/recipients/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/wishlist",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wishlist: [{ title: "x" }] },
      });
      expect(wish404.statusCode).toBe(404);
    } finally {
      repos.findRecipientProfile = origFind;
      repos.listRecipientProfiles = origList;
    }
  });
});
