import { describe, expect, it, vi } from "vitest";

import { createMemoryRepositories } from "../repositories/memory.js";
import {
  createStubPushService,
  deepLinkForPushEvent,
  pushCopyForState,
  pushDedupeKey,
} from "./stub.js";

describe("push stub", () => {
  it("builds order deep links for ladder transitions", () => {
    const orderId = "11111111-1111-4111-8111-111111111111";
    expect(deepLinkForPushEvent("ORDER_PROCESSING", orderId)).toEqual({
      deepLink: `worn://order/${orderId}`,
      screen: "order",
      orderId,
    });
  });

  it("builds reveal deep link for REVEAL_READY", () => {
    const orderId = "22222222-2222-4222-8222-222222222222";
    expect(deepLinkForPushEvent("ORDER_REVEAL_READY", orderId)).toEqual({
      deepLink: `worn://reveal/${orderId}`,
      screen: "reveal",
      orderId,
    });
  });

  it("records structured push_events with dedupe keys", async () => {
    const repos = createMemoryRepositories();
    const push = createStubPushService(repos);
    const orderId = "33333333-3333-4333-8333-333333333333";

    await push.send({
      userId: "user-1",
      orderId,
      eventType: "ORDER_REVEAL_READY",
      title: "Your haul is here",
      body: "Tap to open your cinematic reveal.",
    });

    const events = await push.listEvents("user-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "ORDER_REVEAL_READY",
      dedupeKey: pushDedupeKey(orderId, "ORDER_REVEAL_READY"),
      payload: {
        deepLink: `worn://reveal/${orderId}`,
        screen: "reveal",
        orderId,
      },
      status: "QUEUED",
    });
  });

  it("logs push copy for known order states", () => {
    expect(pushCopyForState("DELIVERED").title).toBe("Delivered");
    expect(pushCopyForState("UNKNOWN").title).toBe("Order update");
  });

  it("logs push sends to console", async () => {
    const repos = createMemoryRepositories();
    const push = createStubPushService(repos);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await push.send({
      userId: "user-2",
      orderId: "44444444-4444-4444-8444-444444444444",
      eventType: "ORDER_PACKED",
      title: "Packed",
      body: "Boxed.",
    });

    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it("delivers via Expo mock and marks SENT when user has pushToken", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919999900001");
    await repos.updateUser(user.id, { pushToken: "ExponentPushToken[play]" });

    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "ticket-play" }));
    const push = createStubPushService(repos, { sendExpo });
    const orderId = "55555555-5555-4555-8555-555555555555";

    await push.send({
      userId: user.id,
      orderId,
      eventType: "ORDER_DELIVERED",
      title: "Delivered",
      body: "Arrived.",
    });

    const events = await push.listEvents(user.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("SENT");
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ExponentPushToken[play]",
        data: expect.objectContaining({ deepLink: `worn://order/${orderId}` }),
      }),
    );
  });
});
