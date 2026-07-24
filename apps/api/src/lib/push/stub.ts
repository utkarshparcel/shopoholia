import type { Repositories } from "../repositories/types.js";

export type PushDeepLinkPayload = {
  deepLink: string;
  screen: "order" | "reveal";
  orderId: string;
};

export type PushPayload = {
  userId: string;
  orderId: string;
  eventType: string;
  title: string;
  body: string;
};

export type PushService = {
  send(payload: PushPayload): Promise<void>;
  listEvents(userId?: string): Promise<
    Array<{
      id: string;
      userId: string;
      orderId: string | null;
      eventType: string;
      title: string;
      body: string;
      dedupeKey: string;
      payload: PushDeepLinkPayload;
      status: "QUEUED" | "SENT" | "FAILED";
      createdAt: Date;
    }>
  >;
};

const ORDER_PUSH_COPY: Record<string, { title: string; body: string }> = {
  PROCESSING: {
    title: "Order confirmed",
    body: "We're getting your haul ready.",
  },
  PACKED: {
    title: "Packed with care",
    body: "Your pieces are boxed and waiting to ship.",
  },
  OUT_FOR_DELIVERY: {
    title: "Out for delivery",
    body: "Your haul is on the move.",
  },
  ARRIVING_SOON: {
    title: "Almost there",
    body: "Your delivery is arriving soon.",
  },
  DELIVERED: {
    title: "Delivered",
    body: "Your package has arrived — reveal loading.",
  },
  REVEAL_READY: {
    title: "Your haul is here",
    body: "Tap to open your cinematic reveal.",
  },
};

export function deepLinkForPushEvent(
  eventType: string,
  orderId: string,
): PushDeepLinkPayload {
  if (eventType === "ORDER_REVEAL_READY") {
    return {
      deepLink: `worn://reveal/${orderId}`,
      screen: "reveal",
      orderId,
    };
  }

  return {
    deepLink: `worn://order/${orderId}`,
    screen: "order",
    orderId,
  };
}

export function pushDedupeKey(orderId: string, eventType: string) {
  return `${orderId}:${eventType}`;
}

export function createStubPushService(repos: Repositories): PushService {
  return {
    async send(payload) {
      const linkPayload = deepLinkForPushEvent(payload.eventType, payload.orderId);
      const dedupeKey = pushDedupeKey(payload.orderId, payload.eventType);

      console.info(
        "[push]",
        payload.eventType,
        payload.orderId,
        linkPayload.deepLink,
        payload.title,
      );

      await repos.recordPushEvent({
        userId: payload.userId,
        orderId: payload.orderId,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
        dedupeKey,
        payload: linkPayload,
        status: "QUEUED",
      });
    },
    async listEvents(userId) {
      return repos.listPushEvents(userId);
    },
  };
}

export function pushCopyForState(state: string) {
  return (
    ORDER_PUSH_COPY[state] ?? {
      title: "Order update",
      body: `Your order is now ${state.toLowerCase().replaceAll("_", " ")}.`,
    }
  );
}
