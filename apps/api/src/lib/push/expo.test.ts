import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRepositories } from "../repositories/memory.js";
import type { Repositories } from "../repositories/types.js";
import { EXPO_PUSH_SEND_URL, createExpoPushService } from "./expo.js";

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const DEVICE_TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";

function expoResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(body: unknown = { data: { status: "ok", id: "ticket-1" } }, status = 200) {
  return vi.fn<typeof fetch>(async () => expoResponse(body, status));
}

async function userWithToken(repos: Repositories, token: string | null = DEVICE_TOKEN) {
  const { user } = await repos.createUser("919800000001");
  if (token) await repos.setPushToken(user.id, token);
  return user;
}

function packedPush(userId: string) {
  return {
    userId,
    orderId: ORDER_ID,
    eventType: "ORDER_PACKED",
    title: "Packed with care",
    body: "Your pieces are boxed and waiting to ship.",
  };
}

describe("createExpoPushService", () => {
  let repos: Repositories;

  beforeEach(() => {
    repos = createMemoryRepositories();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the order update to Expo and marks the event SENT with its ticket id", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch();
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await push.send(packedPush(user.id));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(EXPO_PUSH_SEND_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      to: DEVICE_TOKEN,
      title: "Packed with care",
      body: "Your pieces are boxed and waiting to ship.",
      sound: "default",
      data: { deepLink: `worn://order/${ORDER_ID}`, screen: "order", orderId: ORDER_ID },
    });

    const [event] = await repos.listPushEvents(user.id);
    expect(event).toMatchObject({
      eventType: "ORDER_PACKED",
      status: "SENT",
      expoTicketId: "ticket-1",
    });
  });

  it("deep links the reveal push to the reveal screen", async () => {
    const user = await userWithToken(repos);
    // Expo answers with an array of tickets when it is sent an array; accept both shapes.
    const fetchMock = mockFetch({ data: [{ status: "ok", id: "ticket-2" }] });
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await push.send({
      userId: user.id,
      orderId: ORDER_ID,
      eventType: "ORDER_REVEAL_READY",
      title: "Your haul is here",
      body: "Tap to open your cinematic reveal.",
    });

    const message = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(message.data).toEqual({
      deepLink: `worn://reveal/${ORDER_ID}`,
      screen: "reveal",
      orderId: ORDER_ID,
    });
    expect((await repos.listPushEvents(user.id))[0]).toMatchObject({
      status: "SENT",
      expoTicketId: "ticket-2",
    });
  });

  it("sends EXPO_ACCESS_TOKEN as a bearer token when configured", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch();
    const push = createExpoPushService({ repos, fetch: fetchMock, accessToken: "expo-secret" });

    await push.send(packedPush(user.id));

    expect(fetchMock.mock.calls[0]![1]!.headers).toMatchObject({
      Authorization: "Bearer expo-secret",
    });
  });

  it("marks the event FAILED and keeps the token when Expo rejects the message", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch({
      data: {
        status: "error",
        message: "Message too big",
        details: { error: "MessageTooBig" },
      },
    });
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await expect(push.send(packedPush(user.id))).resolves.toBeUndefined();

    expect((await repos.listPushEvents(user.id))[0]).toMatchObject({
      status: "FAILED",
      expoTicketId: null,
    });
    expect((await repos.findUserById(user.id))?.pushToken).toBe(DEVICE_TOKEN);
  });

  it("marks the event FAILED when the whole request is rejected", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch(
      { errors: [{ code: "TOO_MANY_REQUESTS", message: "Slow down" }] },
      429,
    );
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await expect(push.send(packedPush(user.id))).resolves.toBeUndefined();

    expect((await repos.listPushEvents(user.id))[0]?.status).toBe("FAILED");
    expect(console.warn).toHaveBeenCalledWith(
      "[push] Expo rejected",
      "ORDER_PACKED",
      ORDER_ID,
      "HTTP 429 TOO_MANY_REQUESTS: Slow down",
    );
  });

  it("marks the event FAILED when Expo can't be reached", async () => {
    const user = await userWithToken(repos);
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await expect(push.send(packedPush(user.id))).resolves.toBeUndefined();

    expect((await repos.listPushEvents(user.id))[0]?.status).toBe("FAILED");
    expect((await repos.findUserById(user.id))?.pushToken).toBe(DEVICE_TOKEN);
  });

  it("gives up on a hung request after the timeout", async () => {
    const user = await userWithToken(repos);
    // Never answers; only the abort signal ends the request.
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init!.signal!;
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const push = createExpoPushService({ repos, fetch: fetchMock, timeoutMs: 20 });

    await push.send(packedPush(user.id));

    expect((await repos.listPushEvents(user.id))[0]?.status).toBe("FAILED");
  });

  it("clears the user's token when Expo says the device is no longer registered", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch({
      data: {
        status: "error",
        message: `"${DEVICE_TOKEN}" is not a registered push notification recipient`,
        details: { error: "DeviceNotRegistered" },
      },
    });
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await push.send(packedPush(user.id));

    expect((await repos.listPushEvents(user.id))[0]?.status).toBe("FAILED");
    expect((await repos.findUserById(user.id))?.pushToken).toBeNull();
  });

  it("keeps a token the user registered while the rejected send was in flight", async () => {
    const user = await userWithToken(repos);
    const newToken = "ExponentPushToken[newdevicetoken0000000]";
    const fetchMock = vi.fn<typeof fetch>(async () => {
      await repos.setPushToken(user.id, newToken);
      return expoResponse({
        data: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      });
    });
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await push.send(packedPush(user.id));

    expect((await repos.findUserById(user.id))?.pushToken).toBe(newToken);
  });

  it("sends a repeated order step only once", async () => {
    const user = await userWithToken(repos);
    const fetchMock = mockFetch();
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await Promise.all([push.send(packedPush(user.id)), push.send(packedPush(user.id))]);
    await push.send(packedPush(user.id));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await repos.listPushEvents(user.id)).toHaveLength(1);
  });

  it("only records the event for users without a registered device", async () => {
    const user = await userWithToken(repos, null);
    const fetchMock = mockFetch();
    const push = createExpoPushService({ repos, fetch: fetchMock });

    await push.send(packedPush(user.id));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await push.listEvents(user.id)).toEqual([
      expect.objectContaining({ eventType: "ORDER_PACKED", status: "QUEUED", expoTicketId: null }),
    ]);
  });

  it("never throws into the order step, even when recording fails", async () => {
    const fetchMock = mockFetch();
    const broken: Repositories = {
      ...repos,
      async recordPushEventIfNew() {
        throw new Error("database is down");
      },
    };
    const push = createExpoPushService({ repos: broken, fetch: fetchMock });

    await expect(push.send(packedPush("user-1"))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
