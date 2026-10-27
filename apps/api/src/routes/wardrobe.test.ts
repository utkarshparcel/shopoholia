import { describe, it, expect } from "vitest";
import type {
  DisposeResponse,
  TodayOutfitResponse,
  WardrobeItem,
  WardrobeListResponse,
  WardrobeTryonResponse,
  WasteSummaryResponse,
} from "@worn/shared";
import { buildServer } from "../index.js";
import { UnavailableOcrClient } from "../lib/ocr/index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { buildTestServer, login } from "../test-utils.js";

/** Ask again (as the app does) until the in-process render job has finished. */
async function pollTryon(
  app: Awaited<ReturnType<typeof buildTestServer>>["app"],
  accessToken: string,
  id: string,
): Promise<WardrobeTryonResponse> {
  for (let i = 0; i < 100; i++) {
    const res = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/tryon`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = res.json() as WardrobeTryonResponse;
    if (body.status !== "PROCESSING") return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("try-on still PROCESSING");
}

describe("wardrobe", () => {
  it("creates and lists wardrobe items", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const create = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", colors: ["blue"], brand: "Zara", costMinor: 199900, imageKeys: [`u/${userId}/wardrobe/a.jpg`], garmentImageKey: `u/${userId}/wardrobe/a.jpg` },
    });
    expect(create.statusCode).toBe(201);
    const body = create.json() as WardrobeItem;
    expect(body.category).toBe("shirt");

    const list = await app.inject({ method: "GET", url: "/wardrobe", headers: { authorization: `Bearer ${accessToken}` } });
    expect(list.statusCode).toBe(200);
    const listed = list.json() as WardrobeListResponse;
    expect(listed.items.length).toBe(1);
    expect(listed.items[0]!.id).toBe(body.id);
  });

  it("tryon without an avatar says NO_AVATAR; with one it renders as a job", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", garmentImageKey: `u/${userId}/wardrobe/kurta.jpg`, imageKeys: [`u/${userId}/wardrobe/kurta.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;
    const tryon = await app.inject({ method: "POST", url: `/wardrobe/${id}/tryon`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(tryon.statusCode).toBe(200);
    expect(tryon.json()).toMatchObject({ status: "NO_AVATAR", previewUrl: null, imageKey: null });

    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/user.jpg",
      sourceUploadKeys: ["uploads/a.jpg"],
      bodyMeta: {},
    });
    const queued = await app.inject({ method: "POST", url: `/wardrobe/${id}/tryon`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(queued.statusCode).toBe(202);
    expect((queued.json() as WardrobeTryonResponse).status).toBe("PROCESSING");
    const done = await pollTryon(app, accessToken, id);
    expect(done.status).toBe("READY");
    expect(done.previewUrl).toBeTruthy();
    // The render is stored under the user's own key space, never the garment's key.
    expect(done.imageKey).toMatch(new RegExp(`^u/${userId}/`));
    await app.close();
  });

  it("tryon that fails is stored FAILED with a retryAfter, and isn't re-rendered before it", async () => {
    const { createMockRenderProvider } = await import("../lib/render/provider.js");
    const { createMemoryRepositories } = await import("../lib/repositories/memory.js");
    const { buildServer } = await import("../index.js");
    const base = createMockRenderProvider();
    let tryOnCalls = 0;
    const renderProvider = {
      ...base,
      async tryOn() {
        tryOnCalls += 1;
        throw new Error("provider exploded");
      },
    };
    const repos = createMemoryRepositories();
    const app = await buildServer({ logger: false, deps: { repos, renderProvider } });
    const { accessToken, userId } = await login(app);
    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/user.jpg",
      sourceUploadKeys: ["uploads/a.jpg"],
      bodyMeta: {},
    });
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", garmentImageKey: `u/${userId}/wardrobe/shirt.jpg`, imageKeys: [`u/${userId}/wardrobe/shirt.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;
    const first = await app.inject({ method: "POST", url: `/wardrobe/${id}/tryon`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(first.statusCode).toBe(202);
    const failed = await pollTryon(app, accessToken, id);
    expect(failed.status).toBe("FAILED");
    expect(failed.previewUrl).toBeNull();
    expect((failed as { retryAfter?: string | null }).retryAfter).toBeTruthy();
    const calls = tryOnCalls;
    const again = await app.inject({ method: "POST", url: `/wardrobe/${id}/tryon`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(again.statusCode).toBe(200);
    expect((again.json() as WardrobeTryonResponse).status).toBe("FAILED");
    expect(tryOnCalls).toBe(calls);
    await app.close();
  });

  it("tryon is 503 when the render provider isn't configured", async () => {
    const { createMemoryRepositories } = await import("../lib/repositories/memory.js");
    const { buildServer } = await import("../index.js");
    const { createUnavailableRenderProvider } = await import("../lib/render/provider.js");
    const repos = createMemoryRepositories();
    const app = await buildServer({
      logger: false,
      deps: { repos, renderProvider: createUnavailableRenderProvider() },
    });
    const { accessToken, userId } = await login(app);
    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/user.jpg",
      sourceUploadKeys: ["uploads/a.jpg"],
      bodyMeta: {},
    });
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", garmentImageKey: `u/${userId}/wardrobe/shirt.jpg`, imageKeys: [`u/${userId}/wardrobe/shirt.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;
    const res = await app.inject({ method: "POST", url: `/wardrobe/${id}/tryon`, headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it("tryon cache hit skips second render call", async () => {
    const { createMockRenderProvider } = await import("../lib/render/provider.js");
    const { createMemoryRepositories } = await import("../lib/repositories/memory.js");
    const { buildServer } = await import("../index.js");
    const base = createMockRenderProvider();
    let tryOnCalls = 0;
    const renderProvider = {
      ...base,
      async tryOn(input: { modelImageKey: string; garmentImageKey: string }) {
        tryOnCalls += 1;
        return base.tryOn(input);
      },
    };
    const repos = createMemoryRepositories();
    const app = await buildServer({ logger: false, deps: { repos, renderProvider } });
    const { accessToken, userId } = await login(app);

    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/user.jpg",
      sourceUploadKeys: ["uploads/a.jpg"],
      bodyMeta: {},
    });

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "shirt",
        garmentImageKey: `u/${userId}/wardrobe/shirt.jpg`,
        imageKeys: [`u/${userId}/wardrobe/shirt.jpg`],
      },
    });
    const id = (created.json() as WardrobeItem).id;

    const [first, doubleTap] = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: "POST",
          url: `/wardrobe/${id}/tryon`,
          headers: { authorization: `Bearer ${accessToken}` },
        }),
      ),
    );
    expect(first!.statusCode).toBe(202);
    expect(doubleTap!.statusCode).toBe(202);
    const firstKey = (await pollTryon(app, accessToken, id)).imageKey;
    expect(tryOnCalls).toBe(1);

    const second = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/tryon`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(second.statusCode).toBe(200);
    expect(tryOnCalls).toBe(1);
    expect((second.json() as WardrobeTryonResponse).imageKey).toBe(firstKey);

    await app.close();
  });

  it("logs wear and updates waste summary", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "saree", costMinor: 500000, imageKeys: [`u/${userId}/wardrobe/s.jpg`], garmentImageKey: `u/${userId}/wardrobe/s.jpg` },
    });
    const id = (created.json() as WardrobeItem).id;
    const wear = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: id },
    });
    expect(wear.statusCode).toBe(201);

    const summary = await app.inject({ method: "GET", url: "/waste/summary", headers: { authorization: `Bearer ${accessToken}` } });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as WasteSummaryResponse;
    expect(s.totalItems).toBe(1);
    expect(s.metrics[0]!.wearCount).toBe(1);
    expect(s.metrics[0]!.costPerWearMinor).toBe(500000);
  });

  it("PATCH /wardrobe/:id updates laundryStatus and other fields", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", colors: ["navy"], brand: "Uniqlo", costMinor: 150000 },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as WardrobeItem).id;
    expect((created.json() as WardrobeItem).laundryStatus).toBe("CLEAN");

    const patched = await app.inject({
      method: "PATCH",
      url: `/wardrobe/${id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { laundryStatus: "DIRTY", brand: "COS", category: "oxford shirt" },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json() as WardrobeItem;
    expect(body.laundryStatus).toBe("DIRTY");
    expect(body.brand).toBe("COS");
    expect(body.category).toBe("oxford shirt");

    const laundry = await app.inject({
      method: "PATCH",
      url: `/wardrobe/${id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { laundryStatus: "IN_LAUNDRY" },
    });
    expect(laundry.statusCode).toBe(200);
    expect((laundry.json() as WardrobeItem).laundryStatus).toBe("IN_LAUNDRY");

    const list = await app.inject({
      method: "GET",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as WardrobeListResponse).items[0]!.laundryStatus).toBe("IN_LAUNDRY");
  });

  it("DELETE /wardrobe/:id removes the item", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans" },
    });
    const id = (created.json() as WardrobeItem).id;

    const del = await app.inject({
      method: "DELETE",
      url: `/wardrobe/${id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as WardrobeListResponse).items).toHaveLength(0);

    const missing = await app.inject({
      method: "DELETE",
      url: `/wardrobe/${id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("POST /wear accepts optional imageKey", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", imageKeys: [`u/${userId}/w/k.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;
    const imageKey = `u/${userId}/wear/photo-1.jpg`;

    const wear = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: id, imageKey },
    });
    expect(wear.statusCode).toBe(201);
    const body = wear.json() as { imageKey: string | null; imageUrl: string | null };
    expect(body.imageKey).toBe(imageKey);
    expect(body.imageUrl).toBeTruthy();

    const foreign = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: id, imageKey: "u/00000000-0000-4000-8000-0000000000cc/wear/p.jpg" },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("POST /wear with the same idempotencyKey logs once and answers 200 on the retry", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "kurta", imageKeys: [`u/${userId}/w/k.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;
    const send = () =>
      app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: id, idempotencyKey: "6f1d2c3b-4a59-4e6d-8c7b-9a0b1c2d3e4f" },
      });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect((a.json() as { id: string }).id).toBe((b.json() as { id: string }).id);
    const retry = await send();
    expect(retry.statusCode).toBe(200);
    expect(await repos.listWearLogs(userId, { limit: 10 })).toHaveLength(1);
    await app.close();
  });

  it("PATCH /wardrobe/:id returns 404 for unknown item", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/wardrobe/00000000-0000-4000-8000-0000000000aa",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { laundryStatus: "DIRTY" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("tryon without a garment image is a 400, not a forever PROCESSING", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", imageKeys: [] },
    });
    const id = (created.json() as WardrobeItem).id;
    const tryon = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/tryon`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tryon.statusCode).toBe(400);
    expect((tryon.json() as { message: string }).message).toMatch(/photo/);
    await app.close();
  });

  it("tryon 404 for missing item", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const tryon = await app.inject({
      method: "POST",
      url: "/wardrobe/00000000-0000-4000-8000-0000000000aa/tryon",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tryon.statusCode).toBe(404);
    await app.close();
  });

  it("POST /wardrobe/upload requires image and creates item", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const boundary = "----wornwardrobe";
    const empty = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nshirt\r\n--${boundary}--\r\n`,
      ),
    ]);
    const noFile = await app.inject({
      method: "POST",
      url: "/wardrobe/upload",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: empty,
    });
    expect(noFile.statusCode).toBe(400);

    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="tee.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;
    const mid =
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="category"\r\n\r\n` +
      `shirt\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="colors"\r\n\r\n` +
      `["blue"]\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="brand"\r\n\r\n` +
      `Uniqlo\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="costMinor"\r\n\r\n` +
      `250000\r\n` +
      `--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from("fake-jpeg"),
      Buffer.from(mid, "utf8"),
    ]);
    const ok = await app.inject({
      method: "POST",
      url: "/wardrobe/upload",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(ok.statusCode).toBe(201);
    const item = ok.json() as WardrobeItem;
    expect(item.category).toBe("shirt");
    expect(item.brand).toBe("Uniqlo");
    expect(item.costMinor).toBe(250000);
    expect(item.imageUrls.length).toBeGreaterThan(0);
    await app.close();
  });

  it("POST /wear/photo uploads and POST /wear validates ids", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);

    const missingIds = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(missingIds.statusCode).toBe(400);

    const badItem = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { wardrobeItemId: "00000000-0000-4000-8000-0000000000aa" },
    });
    expect(badItem.statusCode).toBe(404);

    const badOutfit = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { outfitId: "00000000-0000-4000-8000-0000000000bb" },
    });
    expect(badOutfit.statusCode).toBe(404);

    const boundary = "----wornwear";
    const noFile = await app.inject({
      method: "POST",
      url: "/wear/photo",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(`--${boundary}--\r\n`),
    });
    expect(noFile.statusCode).toBe(400);

    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="selfie.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;
    const photoBody = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from("selfie-bytes"),
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);
    const photo = await app.inject({
      method: "POST",
      url: "/wear/photo",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: photoBody,
    });
    expect(photo.statusCode).toBe(201);
    const uploaded = photo.json() as { imageKey: string; imageUrl: string };
    expect(uploaded.imageKey).toMatch(/^u\/[0-9a-f-]{36}\/wear\//);
    expect(uploaded.imageUrl).toBeTruthy();
    await app.close();
  });

  it("outfits/today generates outfit and waste/dead", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    // need at least one item
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", imageKeys: [`u/${userId}/wardrobe/j.jpg`], garmentImageKey: `u/${userId}/wardrobe/j.jpg` },
    });
    const today = await app.inject({ method: "GET", url: "/outfits/today", headers: { authorization: `Bearer ${accessToken}` } });
    expect(today.statusCode).toBe(200);
    const t = today.json() as TodayOutfitResponse;
    expect(t.outfit).not.toBeNull();
    expect(t.outfit!.itemIds.length).toBeGreaterThan(0);

    const dead = await app.inject({ method: "GET", url: "/waste/dead", headers: { authorization: `Bearer ${accessToken}` } });
    expect(dead.statusCode).toBe(200);

    const dispose = await app.inject({
      method: "POST",
      url: `/waste/${t.outfit!.itemIds[0]}/dispose`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mode: "SELL" },
    });
    expect(dispose.statusCode).toBe(200);
    expect((dispose.json() as DisposeResponse).listingId).toBeTruthy();
  });

  it("GET /wardrobe/:id/goes-with returns ranked bottoms and shoes", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const shirt = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "oxford shirt", colors: ["white"], imageKeys: [`u/${userId}/w/shirt.jpg`] },
    });
    const jeans = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "dark jeans", colors: ["blue"], imageKeys: [`u/${userId}/w/jeans.jpg`] },
    });
    const sneakers = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "leather sneakers", colors: ["white"], imageKeys: [`u/${userId}/w/shoes.jpg`] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "polo tee", colors: ["navy"], imageKeys: [`u/${userId}/w/polo.jpg`] },
    });

    const shirtId = (shirt.json() as WardrobeItem).id;
    const jeansId = (jeans.json() as WardrobeItem).id;
    const sneakersId = (sneakers.json() as WardrobeItem).id;

    const res = await app.inject({
      method: "GET",
      url: `/wardrobe/${shirtId}/goes-with`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      anchorId: string;
      matches: Array<{ id: string; score: number; slot: string; reasons: string[] }>;
    };
    expect(body.anchorId).toBe(shirtId);
    expect(body.matches.map((m) => m.id)).toContain(jeansId);
    expect(body.matches.map((m) => m.id)).toContain(sneakersId);
    expect(body.matches.every((m) => m.id !== shirtId)).toBe(true);
    expect(body.matches.every((m) => m.slot !== "top")).toBe(true);
    expect(body.matches[0]!.score).toBeGreaterThanOrEqual(body.matches.at(-1)!.score);
    expect(body.matches[0]!.reasons.length).toBeGreaterThan(0);
  });

  it("POST /wardrobe normalizes jewelry category (N30)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "Gold Necklace", colors: ["gold"], imageKeys: [`u/${userId}/w/neck.jpg`] },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as WardrobeItem).category).toBe("necklace");
  });

  it("GET /wardrobe/rotation filters shoes and bags (N29)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "white sneakers", imageKeys: [`u/${userId}/w/s.jpg`] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "leather tote bag", imageKeys: [`u/${userId}/w/b.jpg`] },
    });
    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "oxford shirt", imageKeys: [`u/${userId}/w/t.jpg`] },
    });
    const res = await app.inject({
      method: "GET",
      url: "/wardrobe/rotation?kind=all",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      suggestions: Array<{ id: string; kind: string; category: string }>;
    };
    expect(body.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(body.suggestions.every((s) => s.kind === "shoes" || s.kind === "bag")).toBe(true);
    expect(body.suggestions.every((s) => !/shirt/i.test(s.category))).toBe(true);
  });

  it("GET /wardrobe/missing-pieces reports gaps with affiliate urls (N31)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    for (const cat of ["white shirt", "navy tee", "striped blouse", "linen shirt"]) {
      await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { category: cat, colors: ["black"], imageKeys: [`u/${userId}/w/${cat}.jpg`] },
      });
    }
    const res = await app.inject({
      method: "GET",
      url: "/wardrobe/missing-pieces",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      gaps: Array<{ suggestion: string; affiliateUrl: string; message: string }>;
      summary: string;
    };
    expect(body.gaps.length).toBeGreaterThan(0);
    expect(body.gaps[0]!.affiliateUrl).toMatch(/^https?:\/\//);
    expect(body.gaps[0]!.affiliateUrl).toContain("shopoholia");
    expect(body.summary.length).toBeGreaterThan(0);
  });

  it("POST /wardrobe/bulk creates N items", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/bulk",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        items: [
          { category: "shirt", colors: ["white"], imageKeys: [`u/${userId}/w/1.jpg`] },
          { category: "jeans", colors: ["blue"], imageKeys: [`u/${userId}/w/2.jpg`] },
          { category: "sneakers", brand: "Nike", costMinor: 500000, imageKeys: [`u/${userId}/w/3.jpg`] },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { items: WardrobeItem[]; created: number };
    expect(body.created).toBe(3);
    expect(body.items).toHaveLength(3);
    expect(body.items.map((i) => i.category).sort()).toEqual(["jeans", "shirt", "sneakers"]);

    const list = await app.inject({
      method: "GET",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as WardrobeListResponse).items.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /wardrobe/autotag returns category/color/brand + near-dup warn", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "shirt",
        brand: "Zara",
        colors: ["navy"],
        imageKeys: [`u/${userId}/wardrobe/existing-zara.jpg`],
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/autotag",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        images: [{ imageKey: `u/${userId}/wardrobe/zara-navy-shirt.jpg` }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      suggestions: Array<{
        category: string;
        colors: string[];
        brand: string | null;
        confidence: number;
        duplicateWarnings: unknown[];
      }>;
    };
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0]!.category).toBe("shirt");
    expect(body.suggestions[0]!.colors).toContain("navy");
    expect(body.suggestions[0]!.brand).toBe("Zara");
    expect(body.suggestions[0]!.duplicateWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /wardrobe/bulk?autoTag fills tags from image key", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/bulk",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        autoTag: true,
        items: [{ category: "other", imageKeys: [`u/${userId}/wardrobe/nike-black-sneakers.jpg`] }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { items: WardrobeItem[]; created: number };
    expect(body.created).toBe(1);
    expect(body.items[0]!.category).toBe("sneakers");
    expect(body.items[0]!.colors).toContain("black");
    expect(body.items[0]!.brand).toBe("Nike");
  });

  it("POST /wardrobe/photo-dump tags a 20+ batch into wardrobe items (N55)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const keys = [
      `u/${userId}/wardrobe/nike-black-sneakers.jpg`,
      `u/${userId}/wardrobe/zara-navy-shirt.jpg`,
      `u/${userId}/wardrobe/levis-blue-jeans.jpg`,
      `u/${userId}/wardrobe/uniqlo-white-tee.jpg`,
      `u/${userId}/wardrobe/adidas-white-sneakers.jpg`,
      `u/${userId}/wardrobe/hm-black-dress.jpg`,
      `u/${userId}/wardrobe/puma-red-hoodie.jpg`,
      `u/${userId}/wardrobe/gap-khaki-pants.jpg`,
      `u/${userId}/wardrobe/ralph-blue-blazer.jpg`,
      `u/${userId}/wardrobe/mango-beige-skirt.jpg`,
      `u/${userId}/wardrobe/nike-grey-joggers.jpg`,
      `u/${userId}/wardrobe/zara-black-boots.jpg`,
      `u/${userId}/wardrobe/levis-denim-jacket.jpg`,
      `u/${userId}/wardrobe/uniqlo-green-shirt.jpg`,
      `u/${userId}/wardrobe/adidas-black-shorts.jpg`,
      `u/${userId}/wardrobe/hm-pink-blouse.jpg`,
      `u/${userId}/wardrobe/puma-blue-sneakers.jpg`,
      `u/${userId}/wardrobe/gap-white-shirt.jpg`,
      `u/${userId}/wardrobe/ralph-brown-belt.jpg`,
      `u/${userId}/wardrobe/mango-orange-kurta.jpg`,
    ];
    expect(keys.length).toBeGreaterThanOrEqual(20);

    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/photo-dump",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { photos: keys.map((imageKey) => ({ imageKey })) },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      items: WardrobeItem[];
      created: number;
      tagged: number;
      duplicateWarnings: unknown[];
    };
    expect(body.created).toBe(20);
    expect(body.tagged).toBe(20);
    expect(body.items).toHaveLength(20);
    expect(body.items.every((i) => i.tags?.includes("photo-dump"))).toBe(true);
    expect(body.items[0]!.category).toBe("sneakers");
    expect(body.items[0]!.brand).toBe("Nike");
    expect(body.items[0]!.colors).toContain("black");
    expect(body.items[1]!.category).toBe("shirt");
    expect(body.items[1]!.brand).toBe("Zara");

    const list = await app.inject({
      method: "GET",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as WardrobeListResponse).items.length).toBeGreaterThanOrEqual(20);
  });

  it("POST /wardrobe/from-purchases adds ingested purchase items", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const { purchase, items } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      currency: "INR",
      totalMinor: 299900,
      purchasedAt: new Date(),
      items: [
        { title: "Cotton Tee", category: "tee", priceMinor: 99900, qty: 1 },
        { title: "Chinos", category: "pants", priceMinor: 200000, qty: 1 },
      ],
    });
    expect(purchase.id).toBeTruthy();
    const purchaseItemIds = items.map((i: { id: string }) => i.id);

    const importable = await app.inject({
      method: "GET",
      url: "/wardrobe/importable-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(importable.statusCode).toBe(200);
    const listed = importable.json() as {
      items: Array<{ purchaseItemId: string; alreadyInWardrobe: boolean; merchant: string }>;
    };
    expect(listed.items.length).toBe(2);
    expect(listed.items.every((i) => !i.alreadyInWardrobe)).toBe(true);
    expect(listed.items[0]!.merchant).toBe("Myntra");

    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/from-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseItemIds },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { items: WardrobeItem[]; created: number };
    expect(body.created).toBe(2);
    expect(body.items.every((i) => i.purchaseItemId != null)).toBe(true);
    expect(body.items[0]!.brand).toBe("Myntra");

    // Idempotent: second call creates 0 new
    const again = await app.inject({
      method: "POST",
      url: "/wardrobe/from-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseItemIds },
    });
    expect(again.statusCode).toBe(201);
    expect((again.json() as { created: number }).created).toBe(0);

    const importableAfter = await app.inject({
      method: "GET",
      url: "/wardrobe/importable-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(
      (importableAfter.json() as { items: Array<{ alreadyInWardrobe: boolean }> }).items.every(
        (i) => i.alreadyInWardrobe,
      ),
    ).toBe(true);
  });

  it("POST /wardrobe/seasonal-swap marks ACTIVE/STORED by season", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const summer = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "linen shirt", tags: ["season:summer"], imageKeys: [`u/${userId}/w/s.jpg`] },
    });
    const winter = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "wool coat", tags: ["season:winter"], imageKeys: [`u/${userId}/w/w.jpg`] },
    });
    const jeans = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "jeans", imageKeys: [`u/${userId}/w/j.jpg`] },
    });
    expect(summer.statusCode).toBe(201);
    expect(winter.statusCode).toBe(201);
    expect(jeans.statusCode).toBe(201);

    const swap = await app.inject({
      method: "POST",
      url: "/wardrobe/seasonal-swap",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { season: "summer" },
    });
    expect(swap.statusCode).toBe(200);
    const body = swap.json() as {
      season: string;
      active: number;
      stored: number;
      items: Array<{ id: string; closetStatus: string; tags: string[] }>;
    };
    expect(body.season).toBe("summer");
    expect(body.stored).toBeGreaterThanOrEqual(1);
    const byId = new Map(body.items.map((i) => [i.id, i]));
    expect(byId.get((summer.json() as WardrobeItem).id)?.closetStatus).toBe("ACTIVE");
    expect(byId.get((winter.json() as WardrobeItem).id)?.closetStatus).toBe("STORED");
    expect(byId.get((jeans.json() as WardrobeItem).id)?.closetStatus).toBe("ACTIVE");
  });

  it("POST /wardrobe/:id/care-ocr parses fixture text onto item", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "cotton tee", imageKeys: [`u/${userId}/wardrobe/tee.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;

    const ocr = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        ocrText: [
          "Machine wash cold 30°C",
          "Non-chlorine bleach when needed",
          "Tumble dry low",
          "Cool iron",
          "Do not dry clean",
        ].join("\n"),
      },
    });
    expect(ocr.statusCode).toBe(200);
    const body = ocr.json() as {
      careRules: { wash: string; dryClean: string; iron: string };
      item: WardrobeItem & { careRules: { wash: string } | null };
    };
    expect(body.careRules.wash).toBe("machine_cold");
    expect(body.careRules.dryClean).toBe("do_not_dry_clean");
    expect(body.item.careRules?.wash).toBe("machine_cold");

    const fromImage = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { imageKey: `u/${userId}/care-tags/wash-label.jpg` },
    });
    expect(fromImage.statusCode).toBe(200);
    expect((fromImage.json() as { careRules: { wash: string } }).careRules.wash).toBe(
      "machine_cold",
    );

    // Another user's tag photo is never read.
    const foreign = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { imageKey: "u/00000000-0000-4000-8000-0000000000cc/care-tags/wash-label.jpg" },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("POST /wardrobe/:id/care-ocr/photo snaps tag via multipart", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", imageKeys: [`u/${userId}/wardrobe/s.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;

    const boundary = "----wornCareTag";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tag.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const photo = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr/photo`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(photo.statusCode).toBe(200);
    const j = photo.json() as { careRules: { wash: string }; item: WardrobeItem };
    expect(j.careRules.wash).toBe("machine_cold");
    expect(j.item.careRules?.wash).toBe("machine_cold");
  });

  it("dry-clean drop-off → IN_LAUNDRY → confirm CLEAN", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "blazer", laundryStatus: "DIRTY" },
    });
    const id = (created.json() as WardrobeItem).id;

    const drop = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ticket: "DC-7788", pickupOn: "2026-08-30" },
    });
    expect(drop.statusCode).toBe(200);
    const dropped = drop.json() as {
      phase: string;
      item: WardrobeItem & { dryCleanTicket: string | null; dryCleanPickupOn: string | null };
    };
    expect(dropped.phase).toBe("AT_CLEANER");
    expect(dropped.item.laundryStatus).toBe("IN_LAUNDRY");
    expect(dropped.item.dryCleanTicket).toBe("DC-7788");
    expect(dropped.item.dryCleanPickupOn).toBe("2026-08-30");

    const confirm = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirm.statusCode).toBe(200);
    const confirmed = confirm.json() as {
      phase: string;
      item: WardrobeItem & { dryCleanTicket: string | null };
    };
    expect(confirmed.phase).toBe("RETURNED");
    expect(confirmed.item.laundryStatus).toBe("CLEAN");
    expect(confirmed.item.dryCleanTicket).toBeNull();
  });

  it("dry-clean cancel returns DIRTY and clears ticket; repairs list + 404 edges", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "coat", laundryStatus: "DIRTY" },
    });
    const id = (created.json() as WardrobeItem).id;

    await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ticket: "DC-CANCEL", pickupOn: "2026-09-01" },
    });

    const cancel = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);
    const cancelled = cancel.json() as {
      phase: string;
      item: WardrobeItem & { dryCleanTicket: string | null; laundryStatus: string };
    };
    expect(cancelled.phase).toBe("IDLE");
    expect(cancelled.item.laundryStatus).toBe("DIRTY");
    expect(cancelled.item.dryCleanTicket).toBeNull();

    const missing = "00000000-0000-4000-8000-0000000000dc";
    const cancel404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/dry-clean/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(cancel404.statusCode).toBe(404);

    const repair = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { costMinor: 15000, repairedOn: "2026-08-26", kind: "ZIP", note: "slider" },
    });
    expect(repair.statusCode).toBe(201);

    const allRepairs = await app.inject({
      method: "GET",
      url: "/wardrobe/repairs",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(allRepairs.statusCode).toBe(200);
    expect((allRepairs.json() as { repairs: unknown[] }).repairs.length).toBeGreaterThanOrEqual(1);

    const repair404 = await app.inject({
      method: "GET",
      url: `/wardrobe/${missing}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(repair404.statusCode).toBe(404);

    const create404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { costMinor: 100, repairedOn: "2026-08-26", kind: "OTHER" },
    });
    expect(create404.statusCode).toBe(404);

    const badRepair = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { costMinor: -1, repairedOn: "2026-08-26", kind: "OTHER" },
    });
    expect(badRepair.statusCode).toBe(400);
  });

  it("PUT /wardrobe/capsule rejects unknown item ids", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "PUT",
      url: "/wardrobe/capsule",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemIds: ["00000000-0000-4000-8000-0000000000ca"] },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/Unknown wardrobe item/i);
  });

  it("seasonal-swap tagItemIds + care-ocr / dry-clean / lend / goes-with / from-purchases edges", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const missing = "00000000-0000-4000-8000-0000000000ff";

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "linen shirt", imageKeys: [`u/${userId}/w/linen.jpg`] },
    });
    const id = (created.json() as WardrobeItem).id;

    const tagged = await app.inject({
      method: "POST",
      url: "/wardrobe/seasonal-swap",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { season: "monsoon", tagItemIds: [id] },
    });
    expect(tagged.statusCode).toBe(200);
    const taggedBody = tagged.json() as {
      season: string;
      items: Array<{ id: string; tags: string[] }>;
    };
    expect(taggedBody.season).toBe("monsoon");
    expect(taggedBody.items.find((i) => i.id === id)?.tags).toContain("season:monsoon");

    const care404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ocrText: "Machine wash cold" },
    });
    expect(care404.statusCode).toBe(404);

    const careNoText = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ocrText: "   " },
    });
    expect(careNoText.statusCode).toBe(400);
    expect((careNoText.json() as { message: string }).message).toMatch(/No care-label text/i);

    const carePhoto404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/care-ocr/photo`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "multipart/form-data; boundary=----empty",
      },
      payload: Buffer.from("------empty--\r\n"),
    });
    expect(carePhoto404.statusCode).toBe(404);

    const carePhotoEmpty = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr/photo`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "multipart/form-data; boundary=----empty2",
      },
      payload: Buffer.from("------empty2--\r\n"),
    });
    expect(carePhotoEmpty.statusCode).toBe(400);

    const dry404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/dry-clean`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ticket: "T-1", pickupOn: "2026-09-01" },
    });
    expect(dry404.statusCode).toBe(404);

    const confirmIdle = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirmIdle.statusCode).toBe(400);

    const cancelIdle = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(cancelIdle.statusCode).toBe(400);

    const confirm404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/dry-clean/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirm404.statusCode).toBe(404);

    const itemRepairs = await app.inject({
      method: "GET",
      url: `/wardrobe/${id}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(itemRepairs.statusCode).toBe(200);
    expect((itemRepairs.json() as { repairs: unknown[] }).repairs).toEqual([]);

    const lend404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/lend`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lentTo: "Sam", dueOn: "2026-09-01" },
    });
    expect(lend404.statusCode).toBe(404);

    const lendBlank = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/lend`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lentTo: "   ", dueOn: "2026-09-01" },
    });
    expect(lendBlank.statusCode).toBe(400);

    const returnNotLent = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/lend/return`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(returnNotLent.statusCode).toBe(400);

    const return404 = await app.inject({
      method: "POST",
      url: `/wardrobe/${missing}/lend/return`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(return404.statusCode).toBe(404);

    const goes404 = await app.inject({
      method: "GET",
      url: `/wardrobe/${missing}/goes-with`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(goes404.statusCode).toBe(404);

    const fromMissing = await app.inject({
      method: "POST",
      url: "/wardrobe/from-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseItemIds: [missing] },
    });
    expect(fromMissing.statusCode).toBe(404);

    const other = await login(app, "919876543299");
    const { items: otherItems } = await repos.createMerchantPurchase({
      userId: other.userId,
      source: "EMAIL",
      merchant: "Ajio",
      currency: "INR",
      totalMinor: 1000,
      purchasedAt: new Date(),
      items: [{ title: "Tee", category: "tee", priceMinor: 1000, qty: 1, imageKey: "pi/tee.jpg" }],
    });
    const stolen = await app.inject({
      method: "POST",
      url: "/wardrobe/from-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseItemIds: [otherItems[0]!.id] },
    });
    // Someone else's purchase reads exactly like a missing one.
    expect(stolen.statusCode).toBe(404);

    const { items: mine } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      currency: "INR",
      totalMinor: 2000,
      purchasedAt: new Date(),
      items: [
        {
          title: "Polo",
          category: "polo",
          priceMinor: 2000,
          qty: 1,
          imageKey: "pi/polo.jpg",
        },
      ],
    });
    const importable = await app.inject({
      method: "GET",
      url: "/wardrobe/importable-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(importable.statusCode).toBe(200);
    const listed = importable.json() as {
      items: Array<{ purchaseItemId: string; imageUrl: string | null }>;
    };
    expect(listed.items.some((i) => i.purchaseItemId === mine[0]!.id && i.imageUrl)).toBe(true);

    const rotation = await app.inject({
      method: "GET",
      url: "/wardrobe/rotation?kind=shoes&limit=5",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(rotation.statusCode).toBe(200);

    const missingPieces = await app.inject({
      method: "GET",
      url: "/wardrobe/missing-pieces?limit=3",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(missingPieces.statusCode).toBe(200);

    await app.close();
  });

  it("tryon render+catch, wear challenge/outfit/streak, race 404s, importable fallback", async () => {
    const { createMockRenderProvider } = await import("../lib/render/provider.js");
    const { createMemoryRepositories } = await import("../lib/repositories/memory.js");
    const { buildServer } = await import("../index.js");
    const base = createMockRenderProvider();
    let boom = false;
    const renderProvider = {
      ...base,
      async tryOn(input: { modelImageKey: string; garmentImageKey: string }) {
        if (boom) throw new Error("render failed");
        return base.tryOn(input);
      },
    };
    const repos = createMemoryRepositories();
    const origByIds = repos.listMerchantPurchaseItemsByPurchaseIds?.bind(repos);
    // Force per-purchase fallback path in importable-purchases.
    (repos as { listMerchantPurchaseItemsByPurchaseIds?: unknown }).listMerchantPurchaseItemsByPurchaseIds =
      undefined;

    const app = await buildServer({ logger: false, deps: { repos, renderProvider } });
    const { accessToken, userId } = await login(app);
    const missing = "00000000-0000-4000-8000-0000000000aa";

    await repos.upsertAvatar({
      userId,
      status: "READY",
      referenceImageKey: "references/user.jpg",
      sourceUploadKeys: ["uploads/a.jpg"],
      bodyMeta: {},
    });

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "shirt",
        garmentImageKey: `u/${userId}/wardrobe/shirt.jpg`,
        imageKeys: [`u/${userId}/wardrobe/shirt.jpg`],
        costMinor: 100000,
      },
    });
    const id = (created.json() as WardrobeItem).id;

    const tryonOk = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/tryon`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tryonOk.statusCode).toBe(202);
    const ready = await pollTryon(app, accessToken, id);
    expect(ready.status).toBe("READY");
    expect(ready.previewUrl).toBeTruthy();

    // A fresh PROCESSING row is a render already in flight: it isn't claimed or rendered again,
    // and a failing provider never turns into a READY that shows the garment photo.
    await repos.upsertTryonPreview({
      userId,
      listingVariantId: null,
      wardrobeItemId: id,
      imageKey: null,
      status: "PROCESSING",
      provider: "mock",
      costMicros: 0,
    });
    boom = true;
    const tryonInFlight = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/tryon`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(tryonInFlight.statusCode).toBe(202);
    expect((tryonInFlight.json() as WardrobeTryonResponse).status).toBe("PROCESSING");

    const outfit = await repos.createOutfit({
      userId,
      itemIds: [id],
      occasion: "work",
    });

    const wearOutfit = await app.inject({
      method: "POST",
      url: "/wear",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { outfitId: outfit.id },
    });
    expect(wearOutfit.statusCode).toBe(201);

    for (let i = 0; i < 3; i++) {
      const wear = await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: id },
      });
      expect(wear.statusCode).toBe(201);
    }

    const day = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - offset);
      return d.toISOString();
    };
    for (const wornOn of [day(2), day(1), day(0)]) {
      const wear = await app.inject({
        method: "POST",
        url: "/wear",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { wardrobeItemId: id, wornOn },
      });
      expect(wear.statusCode).toBe(201);
    }

    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "H&M",
      currency: "INR",
      totalMinor: 500,
      purchasedAt: new Date(),
      items: [{ title: "Socks", category: "socks", priceMinor: 500, qty: 1 }],
    });
    expect(purchase.id).toBeTruthy();
    const importable = await app.inject({
      method: "GET",
      url: "/wardrobe/importable-purchases",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(importable.statusCode).toBe(200);
    expect((importable.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);

    // Race: find succeeds, update returns null → 404 arms.
    const realUpdate = repos.updateWardrobeItem.bind(repos);
    let nullOnce = false;
    repos.updateWardrobeItem = async (itemId, uid, patch) => {
      if (nullOnce) {
        nullOnce = false;
        return null;
      }
      return realUpdate(itemId, uid, patch);
    };

    nullOnce = true;
    const dryRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ticket: "RACE-1", pickupOn: "2026-09-10" },
    });
    expect(dryRace.statusCode).toBe(404);

    await realUpdate(id, userId, {
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: "RACE-OK",
      dryCleanPickupOn: "2026-09-10",
    });
    nullOnce = true;
    const confirmRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirmRace.statusCode).toBe(404);

    await realUpdate(id, userId, {
      laundryStatus: "IN_LAUNDRY",
      dryCleanTicket: "RACE-OK2",
      dryCleanPickupOn: "2026-09-11",
    });
    nullOnce = true;
    const cancelRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/dry-clean/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(cancelRace.statusCode).toBe(404);

    nullOnce = true;
    const lendRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/lend`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lentTo: "Priya", dueOn: "2026-09-20" },
    });
    expect(lendRace.statusCode).toBe(404);

    await realUpdate(id, userId, { lentTo: "Priya", lentDueOn: "2026-09-20" });
    nullOnce = true;
    const returnRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/lend/return`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(returnRace.statusCode).toBe(404);

    // care-ocr: find ok, update null → not_found
    nullOnce = true;
    const careRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ocrText: "Machine wash cold\nCool iron" },
    });
    expect(careRace.statusCode).toBe(404);

    // Restore for cleanup / photo no_text via empty OCR stub.
    repos.updateWardrobeItem = realUpdate;
    if (origByIds) {
      repos.listMerchantPurchaseItemsByPurchaseIds = origByIds;
    }

    const emptyOcr = {
      async recognize() {
        return {
          merchant: undefined,
          totalMinor: undefined,
          items: [],
          confidence: 0.1,
          warrantyHint: null,
          claimContactHint: null,
          raw: { text: "" },
        };
      },
    };
    (app.deps as { ocr: typeof emptyOcr }).ocr = emptyOcr;

    const boundary = "----wornCareEmpty";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tag.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const carePhotoNoText = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr/photo`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(carePhotoNoText.statusCode).toBe(400);

    // care-ocr/photo race: find ok → OCR ok → update null
    (app.deps as { ocr: { recognize: (k: string) => Promise<unknown> } }).ocr = {
      async recognize(imageKey: string) {
        return {
          merchant: undefined,
          totalMinor: undefined,
          items: [{ title: "Machine wash cold", priceMinor: 0 }],
          confidence: 0.9,
          warrantyHint: null,
          claimContactHint: null,
          raw: { text: "Machine wash cold", imageKey },
        };
      },
    };
    nullOnce = true;
    repos.updateWardrobeItem = async (itemId, uid, patch) => {
      if (nullOnce) {
        nullOnce = false;
        return null;
      }
      return realUpdate(itemId, uid, patch);
    };
    const carePhotoRace = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr/photo`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(carePhotoRace.statusCode).toBe(404);

    void missing;
    await app.close();
  });

  it("multipart upload skips empty file part; wear/photo skips empty; lent due filter", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const boundary = "----wornSkipEmpty";
    const emptyThenFile = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="empty.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from(""),
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tee.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("jpeg-bytes"),
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nother\r\n--${boundary}--\r\n`,
      ),
    ]);
    const upload = await app.inject({
      method: "POST",
      url: "/wardrobe/upload",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: emptyThenFile,
    });
    expect(upload.statusCode).toBe(201);

    const wearBoundary = "----wornWearEmpty";
    const wearEmptyThen = Buffer.concat([
      Buffer.from(
        `--${wearBoundary}\r\nContent-Disposition: form-data; name="file"; filename="e.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from(""),
      Buffer.from(
        `\r\n--${wearBoundary}\r\nContent-Disposition: form-data; name="file"; filename="s.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("selfie"),
      Buffer.from(`\r\n--${wearBoundary}--\r\n`),
    ]);
    const wearPhoto = await app.inject({
      method: "POST",
      url: "/wear/photo",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/form-data; boundary=${wearBoundary}`,
      },
      payload: wearEmptyThen,
    });
    expect(wearPhoto.statusCode).toBe(201);

    const item = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "scarf", imageKeys: [`u/${userId}/w/scarf.jpg`], garmentImageKey: `u/${userId}/w/scarf.jpg` },
    });
    const itemId = (item.json() as WardrobeItem).id;
    await app.inject({
      method: "POST",
      url: `/wardrobe/${itemId}/lend`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lentTo: "Asha", dueOn: "2026-08-25" },
    });
    const due = await app.inject({
      method: "GET",
      url: "/wardrobe/lent?due=due&asOf=2026-08-26",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(due.statusCode).toBe(200);
    expect((due.json() as { filter: string; items: unknown[] }).filter).toBe("due");
    expect((due.json() as { items: unknown[] }).items.length).toBe(1);

    const defaultLent = await app.inject({
      method: "GET",
      url: "/wardrobe/lent",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(defaultLent.statusCode).toBe(200);

    await app.close();
  });

  it("capsule GET/PUT happy path + profileId wardrobe filter + overdue lent", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const profiles = await app.inject({
      method: "GET",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const profileId = (profiles.json() as { activeProfileId: string }).activeProfileId;

    // A profile id that isn't the caller's is a 404, not a dangling reference.
    const foreignProfile = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "shirt", profileId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(foreignProfile.statusCode).toBe(404);

    const a = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "shirt",
        colors: ["navy"],
        imageKeys: [`u/${userId}/wardrobe/a.jpg`],
        garmentImageKey: `u/${userId}/wardrobe/a.jpg`,
        profileId,
      },
    });
    const b = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        category: "pants",
        colors: ["black"],
        imageKeys: [`u/${userId}/wardrobe/b.jpg`],
        garmentImageKey: `u/${userId}/wardrobe/b.jpg`,
      },
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const idA = (a.json() as WardrobeItem).id;
    const idB = (b.json() as WardrobeItem).id;

    const put = await app.inject({
      method: "PUT",
      url: "/wardrobe/capsule",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { itemIds: [idA, idB] },
    });
    expect(put.statusCode).toBe(200);
    const capsule = put.json() as { itemIds: string[]; items: WardrobeItem[]; maxN: number };
    expect(capsule.itemIds).toEqual([idA, idB]);
    expect(capsule.items).toHaveLength(2);
    expect(capsule.maxN).toBeGreaterThanOrEqual(2);

    const get = await app.inject({
      method: "GET",
      url: "/wardrobe/capsule",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { itemIds: string[] }).itemIds).toEqual([idA, idB]);

    const scoped = await app.inject({
      method: "GET",
      url: `/wardrobe?profileId=${profileId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(scoped.statusCode).toBe(200);
    const scopedItems = (scoped.json() as WardrobeListResponse).items;
    expect(scopedItems).toHaveLength(1);
    expect(scopedItems[0]!.id).toBe(idA);

    await app.inject({
      method: "POST",
      url: `/wardrobe/${idB}/lend`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lentTo: "Ravi", dueOn: "2026-08-10" },
    });
    const overdue = await app.inject({
      method: "GET",
      url: "/wardrobe/lent?due=overdue&asOf=2026-08-26",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(overdue.statusCode).toBe(200);
    const overdueBody = overdue.json() as { filter: string; items: WardrobeItem[] };
    expect(overdueBody.filter).toBe("overdue");
    expect(overdueBody.items.some((i) => i.id === idB)).toBe(true);

    const returned = await app.inject({
      method: "POST",
      url: `/wardrobe/${idB}/lend/return`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(returned.statusCode).toBe(200);
    expect((returned.json() as { item: { lentTo: string | null }; overdue: boolean }).item.lentTo).toBeNull();
    expect((returned.json() as { overdue: boolean }).overdue).toBe(false);
  });

  it("photo-dump discard hides the item until undone; another user can't triage or undo it", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919800000301");
    const other = await login(app, "919800000302");
    const auth = (token: string) => ({ authorization: `Bearer ${token}` });
    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: auth(owner.accessToken),
      payload: { category: "tee", tags: ["photo-dump"] },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as WardrobeItem).id;
    const listedIds = async () =>
      (
        (await app.inject({ method: "GET", url: "/wardrobe", headers: auth(owner.accessToken) })).json() as WardrobeListResponse
      ).items.map((i) => i.id);
    const triage = (token: string) =>
      app.inject({
        method: "POST",
        url: `/wardrobe/${id}/photo-dump/triage`,
        headers: auth(token),
        payload: { decision: "discard" },
      });
    const undo = (token: string) =>
      app.inject({ method: "POST", url: `/wardrobe/${id}/photo-dump/triage/undo`, headers: auth(token) });

    expect((await triage(other.accessToken)).statusCode).toBe(404);
    const discarded = await triage(owner.accessToken);
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json()).toMatchObject({ decision: "discard", item: null, deleted: true });
    expect(await listedIds()).not.toContain(id);
    // Hidden means hidden everywhere, including edits.
    const patched = await app.inject({
      method: "PATCH",
      url: `/wardrobe/${id}`,
      headers: auth(owner.accessToken),
      payload: { laundryStatus: "DIRTY" },
    });
    expect(patched.statusCode).toBe(404);

    expect((await undo(other.accessToken)).statusCode).toBe(404);
    const restored = await undo(owner.accessToken);
    expect(restored.statusCode).toBe(200);
    expect((restored.json() as { item: WardrobeItem }).item.id).toBe(id);
    expect(await listedIds()).toContain(id);
    // Nothing left to undo.
    expect((await undo(owner.accessToken)).statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /wardrobe/items changes every listed item or none", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919800000303");
    const other = await login(app, "919800000304");
    const auth = (token: string) => ({ authorization: `Bearer ${token}` });
    const make = async (token: string) =>
      (
        (
          await app.inject({ method: "POST", url: "/wardrobe", headers: auth(token), payload: { category: "tee" } })
        ).json() as WardrobeItem
      ).id;
    const a = await make(owner.accessToken);
    const b = await make(owner.accessToken);
    const foreign = await make(other.accessToken);

    const mixed = await app.inject({
      method: "PATCH",
      url: "/wardrobe/items",
      headers: auth(owner.accessToken),
      payload: { ids: [a, foreign], patch: { laundryStatus: "DIRTY" } },
    });
    expect(mixed.statusCode).toBe(404);
    const dup = await app.inject({
      method: "PATCH",
      url: "/wardrobe/items",
      headers: auth(owner.accessToken),
      payload: { ids: [a, a], patch: { laundryStatus: "DIRTY" } },
    });
    expect(dup.statusCode).toBe(400);
    const list = async (token: string) =>
      ((await app.inject({ method: "GET", url: "/wardrobe", headers: auth(token) })).json() as WardrobeListResponse)
        .items;
    expect((await list(owner.accessToken)).every((i) => i.laundryStatus === "CLEAN")).toBe(true);
    expect((await list(other.accessToken))[0]!.laundryStatus).toBe("CLEAN");

    const ok = await app.inject({
      method: "PATCH",
      url: "/wardrobe/items",
      headers: auth(owner.accessToken),
      payload: { ids: [a, b], patch: { laundryStatus: "DIRTY" } },
    });
    expect(ok.statusCode).toBe(200);
    const items = (ok.json() as { items: WardrobeItem[] }).items;
    expect(items.map((i) => i.id).sort()).toEqual([a, b].sort());
    expect(items.every((i) => i.laundryStatus === "DIRTY")).toBe(true);
    await app.close();
  });

  it("GET /wardrobe pages with nextCursor and rejects a bad cursor", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app, "919800000305");
    const headers = { authorization: `Bearer ${accessToken}` };
    for (const category of ["tee", "jeans", "kurta"]) {
      await app.inject({ method: "POST", url: "/wardrobe", headers, payload: { category } });
    }
    const first = await app.inject({ method: "GET", url: "/wardrobe?limit=2", headers });
    expect(first.statusCode).toBe(200);
    const page1 = first.json() as WardrobeListResponse;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const second = await app.inject({
      method: "GET",
      url: `/wardrobe?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
      headers,
    });
    const page2 = second.json() as WardrobeListResponse;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor ?? null).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(3);

    const bad = await app.inject({ method: "GET", url: "/wardrobe?cursor=not-a-cursor", headers });
    expect(bad.statusCode).toBe(400);
    const tooMany = await app.inject({ method: "GET", url: "/wardrobe?limit=201", headers });
    expect(tooMany.statusCode).toBe(400);
    await app.close();
  });

  it("from-purchases called twice at once imports each purchase item once", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app, "919800000306");
    const other = await login(app, "919800000307");
    const { items } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      currency: "INR",
      totalMinor: 99900,
      purchasedAt: new Date(),
      items: [{ title: "Cotton Tee", category: "tee", priceMinor: 99900, qty: 1 }],
    });
    const purchaseItemIds = items.map((i: { id: string }) => i.id);
    const post = (token: string) =>
      app.inject({
        method: "POST",
        url: "/wardrobe/from-purchases",
        headers: { authorization: `Bearer ${token}` },
        payload: { purchaseItemIds },
      });
    const [r1, r2] = await Promise.all([post(accessToken), post(accessToken)]);
    expect([r1.statusCode, r2.statusCode]).toEqual([201, 201]);
    const b1 = r1.json() as { items: WardrobeItem[]; created: number };
    const b2 = r2.json() as { items: WardrobeItem[]; created: number };
    expect(b1.created + b2.created).toBe(1);
    expect(b1.items[0]!.id).toBe(b2.items[0]!.id);
    const listed = (
      await app.inject({ method: "GET", url: "/wardrobe", headers: { authorization: `Bearer ${accessToken}` } })
    ).json() as WardrobeListResponse;
    expect(listed.items).toHaveLength(1);
    // Someone else's purchase is not theirs to import.
    expect((await post(other.accessToken)).statusCode).toBe(404);
    await app.close();
  });

  it("POST /wardrobe/bulk with another user's profile creates nothing", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken } = await login(app, "919800000308");
    const other = await login(app, "919800000309");
    const foreignProfile = await repos.createClosetProfile({
      ownerUserId: other.userId,
      householdId: null,
      name: "Partner",
      kind: "PARTNER",
    });
    const headers = { authorization: `Bearer ${accessToken}` };
    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/bulk",
      headers,
      payload: { items: [{ category: "tee" }, { category: "jeans", profileId: foreignProfile.id }] },
    });
    expect(res.statusCode).toBe(404);
    const listed = (await app.inject({ method: "GET", url: "/wardrobe", headers })).json() as WardrobeListResponse;
    expect(listed.items).toHaveLength(0);
    await app.close();
  });

  it("POST /wardrobe/upload rejects bad fields before anything is stored", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app, "919800000310");
    let puts = 0;
    const put = app.deps.storage.put.bind(app.deps.storage);
    app.deps.storage.put = async (input) => {
      puts += 1;
      return put(input);
    };
    const boundary = "----wornbadfields";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="tee.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      Buffer.from("fake-jpeg"),
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="costMinor"\r\n\r\n-5\r\n--${boundary}--\r\n`,
      ),
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/wardrobe/upload",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(puts).toBe(0);
    await app.close();
  });

  it("care-ocr says 503 when no OCR provider is configured, and stores nothing", async () => {
    const repos = createMemoryRepositories();
    const app = await buildServer({ logger: false, deps: { repos, ocr: new UnavailableOcrClient() } });
    const { accessToken, userId } = await login(app, "919800000311");
    const headers = { authorization: `Bearer ${accessToken}` };
    const id = (
      (await app.inject({ method: "POST", url: "/wardrobe", headers, payload: { category: "kurta" } })).json() as WardrobeItem
    ).id;
    const res = await app.inject({
      method: "POST",
      url: `/wardrobe/${id}/care-ocr`,
      headers,
      payload: { imageKey: `u/${userId}/care-tags/tag.jpg` },
    });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe("ocr_unavailable");
    expect((await repos.findWardrobeItem(id, userId))?.careRules ?? null).toBeNull();
    await app.close();
  });
});
