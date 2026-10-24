import FormData from "form-data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../index.js";
import { createDevOtpService } from "../lib/auth/otp.js";
import { createAvatarProcessingHandler } from "../lib/jobs/avatar-processing.js";
import { createOrderTransitionHandler } from "../lib/jobs/order-processing.js";
import { createMemoryJobQueue } from "../lib/jobs/queue.js";
import {
  createDeliveredRenderHandler,
  createRenderProcessingHandler,
} from "../lib/jobs/render-processing.js";
import { createTryonProcessingHandler } from "../lib/jobs/tryon-processing.js";
import { createExpoPushService } from "../lib/push/expo.js";
import { createMockRenderProvider } from "../lib/render/provider.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { seedCatalog } from "../lib/seed/catalog.js";
import { createMockStorage } from "../lib/storage/r2.js";

type App = Awaited<ReturnType<typeof buildServer>>;

const DEVICE_TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const OTHER_DEVICE_TOKEN = "ExpoPushToken[zyxwvutsrqponmlkjihgfe]";

// Same wiring as routes.test.ts, with the real Expo push service over a mocked fetch.
async function buildTestDeps(fetchMock: typeof fetch) {
  const repos = createMemoryRepositories();
  const storage = createMockStorage();
  const renderProvider = createMockRenderProvider();
  const push = createExpoPushService({ repos, fetch: fetchMock });
  const renderHandler = createRenderProcessingHandler({ repos, storage, renderProvider, push });

  const jobQueue = createMemoryJobQueue(
    {
      avatar: createAvatarProcessingHandler({ repos, storage, renderProvider }),
      tryon: createTryonProcessingHandler({ repos, storage, renderProvider }),
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
  await seedCatalog(repos, storage, 50, { preferScraped: false });
  return { repos, storage, renderProvider, jobQueue, otp, push };
}

async function login(app: App, phone = "919876543210") {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  const { accessToken } = verify.json() as { accessToken: string };
  const me = await app.deps.repos.findUserByPhone(phone);
  return { headers: { authorization: `Bearer ${accessToken}` }, userId: me!.id };
}

function registerToken(app: App, headers: Record<string, string>, token: string) {
  return app.inject({ method: "PUT", url: "/me/push-token", headers, payload: { token } });
}

async function pushTokenOf(app: App, userId: string) {
  return (await app.deps.repos.findUserById(userId))?.pushToken;
}

describe("push token routes", () => {
  let app: App;

  beforeEach(async () => {
    app = await buildServer({ logger: false, deps: await buildTestDeps(vi.fn()) });
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires sign-in", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/me/push-token",
      payload: { token: DEVICE_TOKEN },
    });
    const del = await app.inject({ method: "DELETE", url: "/me/push-token" });

    expect(put.statusCode).toBe(401);
    expect(del.statusCode).toBe(401);
  });

  it("registers the device's Expo push token for the signed-in user", async () => {
    const { headers, userId } = await login(app);

    const res = await registerToken(app, headers, DEVICE_TOKEN);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ registered: true });
    expect(await pushTokenOf(app, userId)).toBe(DEVICE_TOKEN);

    // Newer SDKs hand out ExpoPushToken[...]; re-registering replaces the old token.
    expect((await registerToken(app, headers, OTHER_DEVICE_TOKEN)).statusCode).toBe(200);
    expect(await pushTokenOf(app, userId)).toBe(OTHER_DEVICE_TOKEN);
  });

  it.each([
    "",
    "not-a-token",
    "ExponentPushToken[]",
    "ExponentPushToken[has space]",
    "fcm:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx",
  ])("rejects %j as a push token", async (token) => {
    const { headers, userId } = await login(app);

    const res = await registerToken(app, headers, token);

    expect(res.statusCode).toBe(400);
    expect(await pushTokenOf(app, userId)).toBeNull();
  });

  it("moves a device token to the account that registered it last", async () => {
    const first = await login(app, "919800000001");
    const second = await login(app, "919800000002");

    await registerToken(app, first.headers, DEVICE_TOKEN);
    await registerToken(app, second.headers, DEVICE_TOKEN);

    expect(await pushTokenOf(app, first.userId)).toBeNull();
    expect(await pushTokenOf(app, second.userId)).toBe(DEVICE_TOKEN);
  });

  it("clears the token on sign-out", async () => {
    const { headers, userId } = await login(app);
    await registerToken(app, headers, DEVICE_TOKEN);

    const res = await app.inject({ method: "DELETE", url: "/me/push-token", headers });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ registered: false });
    expect(await pushTokenOf(app, userId)).toBeNull();
  });

  it("only clears the given token while it is still the saved one", async () => {
    const { headers, userId } = await login(app);
    await registerToken(app, headers, DEVICE_TOKEN);

    // Signing out on a device the user has since replaced leaves the newer token alone.
    const stale = await app.inject({
      method: "DELETE",
      url: "/me/push-token",
      headers,
      payload: { token: OTHER_DEVICE_TOKEN },
    });
    expect(stale.statusCode).toBe(200);
    expect(await pushTokenOf(app, userId)).toBe(DEVICE_TOKEN);

    await app.inject({
      method: "DELETE",
      url: "/me/push-token",
      headers,
      payload: { token: DEVICE_TOKEN },
    });
    expect(await pushTokenOf(app, userId)).toBeNull();
  });
});

describe("order push notifications", () => {
  let app: App;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    let ticket = 0;
    fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { status: "ok", id: `ticket-${++ticket}` } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    app = await buildServer({ logger: false, deps: await buildTestDeps(fetchMock) });
  });

  afterEach(async () => {
    await app.close();
  });

  it("pushes every order step to the registered device, then the reveal", async () => {
    const { headers, userId } = await login(app);
    await registerToken(app, headers, DEVICE_TOKEN);

    const form = new FormData();
    form.append("photo", Buffer.from("fake-image"), {
      filename: "selfie.jpg",
      contentType: "image/jpeg",
    });
    await app.inject({
      method: "POST",
      url: "/avatar",
      headers: { ...headers, ...form.getHeaders() },
      payload: form,
    });
    await app.deps.jobQueue.drain!();

    const feed = await app.inject({ method: "GET", url: "/feed?limit=1" });
    const listing = await app.inject({ method: "GET", url: `/listings/${feed.json().items[0].id}` });
    await app.inject({
      method: "POST",
      url: "/cart",
      headers,
      payload: { variantId: listing.json().variants[0].id, quantity: 1 },
    });
    const order = await app.inject({
      method: "POST",
      url: "/orders",
      headers,
      payload: { tier: "EXPRESS" },
    });
    expect(order.statusCode).toBe(201);
    const orderId = order.json().id as string;

    await app.deps.jobQueue.flushOrderTransitions!();
    await app.deps.jobQueue.flushRenderJobs!();

    const messages = fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(messages.map((m) => m.title)).toEqual([
      "Order confirmed",
      "Packed with care",
      "Out for delivery",
      "Almost there",
      "Delivered",
      "Your haul is here",
    ]);
    for (const message of messages) expect(message.to).toBe(DEVICE_TOKEN);
    expect(messages.slice(0, 5).map((m) => m.data.deepLink)).toEqual(
      Array(5).fill(`worn://order/${orderId}`),
    );
    expect(messages[5].data).toEqual({
      deepLink: `worn://reveal/${orderId}`,
      screen: "reveal",
      orderId,
    });

    const events = await app.deps.repos.listPushEvents(userId);
    expect(events).toHaveLength(6);
    expect(events.every((e) => e.status === "SENT" && e.expoTicketId?.startsWith("ticket-"))).toBe(
      true,
    );
  });
});
