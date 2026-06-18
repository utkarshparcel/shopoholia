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
});
