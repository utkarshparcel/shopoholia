import FormData from "form-data";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ONBOARDING_COIN_GRANT } from "@worn/shared";
import { buildServer } from "./index.js";
import { createAvatarProcessingHandler } from "./lib/jobs/avatar-processing.js";
import { createTryonProcessingHandler } from "./lib/jobs/tryon-processing.js";
import { createOrderTransitionHandler } from "./lib/jobs/order-processing.js";
import {
  createDeliveredRenderHandler,
  createRenderProcessingHandler,
} from "./lib/jobs/render-processing.js";
import { createMemoryJobQueue } from "./lib/jobs/queue.js";
import { createMemoryRepositories } from "./lib/repositories/memory.js";
import { createMockRenderProvider } from "./lib/render/provider.js";
import { createMockStorage } from "./lib/storage/r2.js";
import { createDevOtpService } from "./lib/auth/otp.js";
import { createStubPushService } from "./lib/push/stub.js";
import { seedCatalog } from "./lib/seed/catalog.js";
import { notImplemented } from "./lib/stub.js";

async function buildTestDeps() {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const renderProvider = createMockRenderProvider();
  const push = createStubPushService(repos);
  const avatarHandler = createAvatarProcessingHandler({ repos, storage, renderProvider });
  const tryonHandler = createTryonProcessingHandler({ repos, storage, renderProvider });
  const renderHandler = createRenderProcessingHandler({ repos, storage, renderProvider, push });

  const jobQueue = createMemoryJobQueue(
    {
      avatar: avatarHandler,
      tryon: tryonHandler,
      orderTransition: createOrderTransitionHandler({
        repos,
        push,
        onDelivered: async (orderId) => {
          await jobQueue.enqueueDeliveredRender({ orderId });
        },
      }),
      deliveredRender: createDeliveredRenderHandler({
        repos,
        enqueueRender: async (job) => jobQueue.enqueueRender(job),
      }),
      render: renderHandler,
    },
    { autoProcess: false, repos },
  );

  const otp = createDevOtpService(repos);
  await seedCatalog(repos, storage, 50);
  return { repos, storage, renderProvider, jobQueue, otp, push };
}

async function login(app: Awaited<ReturnType<typeof buildServer>>, phone = "919876543210") {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  return verify.json() as { accessToken: string };
}

async function readyAvatar(app: Awaited<ReturnType<typeof buildServer>>, token: string) {
  const form = new FormData();
  form.append("photo", Buffer.from("fake-image"), { filename: "selfie.jpg", contentType: "image/jpeg" });
  await app.inject({
    method: "POST",
    url: "/avatar",
    headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
    payload: form,
  });
  await app.deps.jobQueue.drain!();
}

describe("health", () => {
  it("returns ok", async () => {
    const app = await buildServer({ logger: false });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    await app.close();
  });
});

describe("auth", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("sends dev OTP", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp",
      payload: { phone: "919876543210" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain("123456");
  });

  it("verifies OTP and grants onboarding coins for new users", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/otp",
      payload: { phone: "919876543210" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { phone: "919876543210", otp: "123456" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isNewUser).toBe(true);
    expect(body.coinBalance).toBe(ONBOARDING_COIN_GRANT);
    expect(body.accessToken).toBeTruthy();
  });

  it("rejects invalid OTP", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/otp",
      payload: { phone: "919876543210" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { phone: "919876543210", otp: "000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refreshes tokens", async () => {
    await app.inject({ method: "POST", url: "/auth/otp", payload: { phone: "919876543210" } });
    const verify = await app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { phone: "919876543210", otp: "123456" },
    });
    const { refreshToken } = verify.json();

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });
});

describe("avatar", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;

  beforeEach(async () => {
    const deps = await buildTestDeps();
    app = await buildServer({ logger: false, deps });
    const session = await login(app);
    token = session.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/avatar" });
    expect(res.statusCode).toBe(401);
  });

  it("uploads avatar and processes job", async () => {
    const form = new FormData();
    form.append("photo", Buffer.from("fake-image"), { filename: "selfie.jpg", contentType: "image/jpeg" });

    const upload = await app.inject({
      method: "POST",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });

    expect(upload.statusCode).toBe(202);
    expect(upload.json().status).toBe("PROCESSING");

    await app.deps.jobQueue.drain!();

    const status = await app.inject({
      method: "GET",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body.status).toBe("READY");
    expect(body.referencePreviewUrl).toContain("references/");
  });

  it("rejects empty upload", async () => {
    const form = new FormData();
    const res = await app.inject({
      method: "POST",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });
    expect(res.statusCode).toBe(400);
  });

  it("deletes avatar", async () => {
    const form = new FormData();
    form.append("photo", Buffer.from("fake-image"), { filename: "selfie.jpg" });
    await app.inject({
      method: "POST",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });

    const del = await app.inject({
      method: "DELETE",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const status = await app.inject({
      method: "GET",
      url: "/avatar",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.json().status).toBe("NONE");
  });
});

describe("feed", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns paginated listings with house-model imagery", async () => {
    const res = await app.inject({ method: "GET", url: "/feed?limit=20" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(20);
    expect(body.items[0].houseModelImageUrl).toContain("house-models/");
    expect(body.nextCursor).toBeTruthy();
  });

  it("paginates with cursor", async () => {
    const first = await app.inject({ method: "GET", url: "/feed?limit=10" });
    const cursor = first.json().nextCursor;
    const second = await app.inject({ method: "GET", url: `/feed?limit=10&cursor=${cursor}` });
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id);
  });

  it("returns listing detail with variants", async () => {
    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    const listingId = feed.json().items[0].id;
    const res = await app.inject({ method: "GET", url: `/listings/${listingId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variants.length).toBeGreaterThan(0);
    expect(body.tags.length).toBeGreaterThan(0);
  });

  it("returns 404 for unknown listing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/listings/00000000-0000-4000-8000-000000000099",
    });
    expect(res.statusCode).toBe(404);
  });

  it("includes affiliate URLs on seeded listings", async () => {
    const res = await app.inject({ method: "GET", url: "/feed?limit=1" });
    expect(res.json().items[0].affiliateUrl).toContain("affiliate.worn.example");
  });
});

describe("sellers", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const auth = await login(app);
    token = auth.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it("registers a seller account", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sellers/register",
      headers: { authorization: `Bearer ${token}` },
      payload: { shopName: "Atelier Nine" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.shopName).toBe("Atelier Nine");
    expect(body.id).toBeTruthy();
  });

  it("rejects listing creation before seller registration", async () => {
    const form = new FormData();
    form.append("title", "Linen Blazer");
    form.append("category", "Outerwear");
    form.append("coinPrice", "120");
    form.append("photo", Buffer.from("fake-image"), {
      filename: "blazer.jpg",
      contentType: "image/jpeg",
    });

    const res = await app.inject({
      method: "POST",
      url: "/sellers/listings",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });
    expect(res.statusCode).toBe(403);
  });

  it("creates a seller listing with product photos", async () => {
    await app.inject({
      method: "POST",
      url: "/sellers/register",
      headers: { authorization: `Bearer ${token}` },
      payload: { shopName: "Studio Loom" },
    });

    const form = new FormData();
    form.append("title", "Handloom Kurta");
    form.append("category", "Tops");
    form.append("tags", "handloom,summer");
    form.append("coinPrice", "85");
    form.append("size", "M");
    form.append("color", "Indigo");
    form.append("photo", Buffer.from("fake-image"), {
      filename: "kurta.jpg",
      contentType: "image/jpeg",
    });

    const res = await app.inject({
      method: "POST",
      url: "/sellers/listings",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.listingId).toBeTruthy();
    expect(body.variantId).toBeTruthy();
  });

  it("lists seller listings and filters feed by seller_id", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/sellers/register",
      headers: { authorization: `Bearer ${token}` },
      payload: { shopName: "River & Reed" },
    });
    const sellerId = register.json().id as string;

    const form = new FormData();
    form.append("title", "River Silk Saree");
    form.append("category", "Ethnic");
    form.append("coinPrice", "200");
    form.append("photo", Buffer.from("fake-image"), {
      filename: "saree.jpg",
      contentType: "image/jpeg",
    });
    await app.inject({
      method: "POST",
      url: "/sellers/listings",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form,
    });

    const mine = await app.inject({
      method: "GET",
      url: "/sellers/listings",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items).toHaveLength(1);
    expect(mine.json().items[0].sellerName).toBe("River & Reed");
    expect(mine.json().items[0].title).toBe("River Silk Saree");

    const filtered = await app.inject({
      method: "GET",
      url: `/feed?seller_id=${sellerId}&limit=50`,
    });
    expect(filtered.statusCode).toBe(200);
    const filteredItems = filtered.json().items;
    expect(filteredItems.length).toBeGreaterThanOrEqual(1);
    expect(filteredItems.every((item: { sellerId: string }) => item.sellerId === sellerId)).toBe(
      true,
    );
    expect(filteredItems[0].sellerName).toBe("River & Reed");
  });
});

describe("tryon", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  let listingId: string;
  let variantId: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const session = await login(app);
    token = session.accessToken;
    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    listingId = feed.json().items[0].id;
    const detail = await app.inject({ method: "GET", url: `/listings/${listingId}` });
    variantId = detail.json().variants[0].id;
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/listings/${listingId}/tryon`,
      payload: { variantId },
    });
    expect(res.statusCode).toBe(401);
  });

  it("requires ready avatar", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/listings/${listingId}/tryon`,
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId },
    });
    expect(res.statusCode).toBe(400);
  });

  it("enqueues try-on then returns cached preview", async () => {
    await readyAvatar(app, token);

    const pending = await app.inject({
      method: "POST",
      url: `/listings/${listingId}/tryon`,
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId },
    });
    expect(pending.statusCode).toBe(202);
    expect(pending.json().status).toBe("PROCESSING");

    await app.deps.jobQueue.drain!();

    const ready = await app.inject({
      method: "POST",
      url: `/listings/${listingId}/tryon`,
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().status).toBe("READY");
    expect(ready.json().previewUrl).toContain("tryon/");
  });
});

describe("cart", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  let variantId: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const session = await login(app);
    token = session.accessToken;
    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    const listingId = feed.json().items[0].id;
    const detail = await app.inject({ method: "GET", url: `/listings/${listingId}` });
    variantId = detail.json().variants[0].id;
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/cart" });
    expect(res.statusCode).toBe(401);
  });

  it("adds, lists, and removes cart items", async () => {
    const empty = await app.inject({
      method: "GET",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(empty.json().items).toHaveLength(0);

    const added = await app.inject({
      method: "POST",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId, quantity: 2 },
    });
    expect(added.statusCode).toBe(200);
    expect(added.json().items).toHaveLength(1);
    expect(added.json().coinTotal).toBeGreaterThan(0);

    const removed = await app.inject({
      method: "DELETE",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId },
    });
    expect(removed.json().items).toHaveLength(0);
  });
});

describe("coins", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const session = await login(app);
    token = session.accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns balance after onboarding grant", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/coins/balance",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balance).toBe(ONBOARDING_COIN_GRANT);
  });

  it("lists coin transactions", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/coins/transactions",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.transactions.length).toBeGreaterThan(0);
    expect(body.transactions[0].type).toBe("GRANT");
  });
});

describe("orders", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  let variantId: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const session = await login(app);
    token = session.accessToken;
    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    const listingId = feed.json().items[0].id;
    const detail = await app.inject({ method: "GET", url: `/listings/${listingId}` });
    variantId = detail.json().variants[0].id;
    await app.inject({
      method: "POST",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId, quantity: 1 },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects checkout with empty cart", async () => {
    await app.inject({
      method: "DELETE",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId },
    });

    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "EXPRESS" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("places order, debits coins, and clears cart", async () => {
    const balanceBefore = (
      await app.inject({
        method: "GET",
        url: "/coins/balance",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().balance;

    const cartBefore = (
      await app.inject({
        method: "GET",
        url: "/cart",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    expect(cartBefore.items).toHaveLength(1);

    const created = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "STANDARD" },
    });
    expect(created.statusCode).toBe(201);
    const order = created.json();
    expect(order.state).toBe("PROCESSING");
    expect(order.coinTotal).toBe(cartBefore.coinTotal);
    expect(order.stateEta.PACKED).toBeTruthy();

    const balanceAfter = (
      await app.inject({
        method: "GET",
        url: "/coins/balance",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().balance;
    expect(balanceAfter).toBe(balanceBefore - order.coinTotal);

    const cartAfter = await app.inject({
      method: "GET",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cartAfter.json().items).toHaveLength(0);

    const spendTx = (
      await app.inject({
        method: "GET",
        url: "/coins/transactions",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().transactions.find((tx: { type: string }) => tx.type === "SPEND_ORDER");
    expect(spendTx).toBeTruthy();
  });

  it("lists and fetches order by id", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "EXPRESS" },
    });
    const orderId = created.json().id;

    const list = await app.inject({
      method: "GET",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().orders).toHaveLength(1);

    const detail = await app.inject({
      method: "GET",
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(orderId);
  });

  it("advances order state ladder when transitions flush", async () => {
    await readyAvatar(app, token);

    const created = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "EXPRESS" },
    });
    const orderId = created.json().id;

    await app.deps.jobQueue.flushOrderTransitions!();

    let detail = await app.inject({
      method: "GET",
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().state).toBe("DELIVERED");

    await app.deps.jobQueue.flushRenderJobs!();

    detail = await app.inject({
      method: "GET",
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().state).toBe("REVEAL_READY");

    const pushes = await app.deps.push.listEvents();
    expect(pushes.some((e) => e.eventType === "ORDER_DELIVERED")).toBe(true);
    expect(pushes.some((e) => e.eventType === "ORDER_REVEAL_READY")).toBe(true);
    const revealPush = pushes.find((e) => e.eventType === "ORDER_REVEAL_READY");
    expect(revealPush?.payload.deepLink).toBe(`worn://reveal/${orderId}`);
    expect(revealPush?.payload.screen).toBe("reveal");
  });

  it("returns same order for idempotent checkout", async () => {
    const key = "550e8400-e29b-41d4-a716-446655440000";
    const first = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "SLOW_BURN", idempotencyKey: key },
    });
    const second = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "SLOW_BURN", idempotencyKey: key },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);
  });
});

describe("reveal", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let token: string;
  let orderId: string;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps() });
    const session = await login(app);
    token = session.accessToken;
    await readyAvatar(app, token);

    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    const listingId = feed.json().items[0].id;
    const detail = await app.inject({ method: "GET", url: `/listings/${listingId}` });
    const variantId = detail.json().variants[0].id;

    await app.inject({
      method: "POST",
      url: "/cart",
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId, quantity: 1 },
    });

    const created = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { tier: "EXPRESS" },
    });
    orderId = created.json().id;

    await app.deps.jobQueue.flushOrderTransitions!();
    await app.deps.jobQueue.flushRenderJobs!();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns free renders and locked placeholders", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/orders/${orderId}/reveal`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.orderId).toBe(orderId);
    expect(body.renders.length).toBeGreaterThan(0);

    const free = body.renders.filter((r: { isFree: boolean }) => r.isFree);
    const locked = body.renders.filter(
      (r: { isFree: boolean; unlocked: boolean }) => !r.isFree && !r.unlocked,
    );
    expect(free.every((r: { status: string }) => r.status === "DONE")).toBe(true);
    expect(free.every((r: { imageUrl: string | null }) => r.imageUrl)).toBeTruthy();
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((r: { imageUrl: null }) => r.imageUrl === null)).toBe(true);
    expect(locked[0].unlockCostCoins).toBe(50);
  });

  it("unlocks paywalled renders and debits coins", async () => {
    const reveal = await app.inject({
      method: "GET",
      url: `/orders/${orderId}/reveal`,
      headers: { authorization: `Bearer ${token}` },
    });
    const lockedId = reveal
      .json()
      .renders.find((r: { isFree: boolean; unlocked: boolean }) => !r.isFree && !r.unlocked).id;

    const balanceBefore = (
      await app.inject({
        method: "GET",
        url: "/coins/balance",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().balance;

    const unlock = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/reveal/unlock`,
      headers: { authorization: `Bearer ${token}` },
      payload: { renderIds: [lockedId] },
    });
    expect(unlock.statusCode).toBe(200);
    expect(unlock.json().coinsSpent).toBe(50);
    expect(unlock.json().renders[0].unlocked).toBe(true);
    expect(unlock.json().renders[0].status).toBe("DONE");
    expect(unlock.json().renders[0].imageUrl).toBeTruthy();

    const balanceAfter = (
      await app.inject({
        method: "GET",
        url: "/coins/balance",
        headers: { authorization: `Bearer ${token}` },
      })
    ).json().balance;
    expect(balanceAfter).toBe(balanceBefore - 50);
  });

  it("records reveal satisfaction rating", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/reveal/rating`,
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: "loved" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      orderId,
      rating: "loved",
      recorded: true,
    });
  });
});

describe("stub routes", () => {
  it("returns 501 for unimplemented endpoints", async () => {
    const reply = {
      code: (status: number) => ({
        send: (body: unknown) => ({ status, body }),
      }),
    } as never;
    const result = notImplemented(reply, "GET /feed");
    expect(result.status).toBe(501);
  });
});

describe("render provider", () => {
  it("creates avatar reference, try-on, and scenario pass via mock", async () => {
    const provider = createMockRenderProvider();
    const ref = await provider.createAvatarReference({ uploadKeys: ["uploads/u/1.jpg"] });
    expect(ref.referenceImageKey).toBe("references/u/1.jpg");

    const tryon = await provider.tryOn({
      modelImageKey: ref.referenceImageKey,
      garmentImageKey: "garments/x.jpg",
    });
    expect(tryon.imageKey).toContain("tryon/");
    expect(tryon.costMicros).toBeGreaterThan(0);

    const styled = await provider.scenarioPass({
      tryOnImageKey: tryon.imageKey,
      scenario: "STUDIO",
    });
    expect(styled.imageKey).toContain("reveal/studio/");
    expect(styled.costMicros).toBeGreaterThan(0);
  });
});

describe("memory repositories", () => {
  it("tracks coin grants", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919999999999");
    await repos.grantCoins({ userId: user.id, delta: 100, type: "GRANT" });
    expect(await repos.getCoinBalance(user.id)).toBe(100);
  });
});

describe("seed catalog", () => {
  it("seeds 50 listings with variants", async () => {
    const repos = createMemoryRepositories();
    const storage = createMockStorage();
    const { listings, variants } = await seedCatalog(repos, storage, 50);
    expect(listings).toHaveLength(50);
    expect(variants.length).toBeGreaterThan(100);
    expect(listings[0]?.affiliateUrl).toContain("affiliate.worn.example");
  });
});
