import {
  closetDeepLinkForEvent,
  deliverQueuedPush,
  type ClosetPushDeepLink,
  type sendExpoPush,
} from "@worn/shared";
import type { Repositories } from "../repositories/types.js";

export type PushDeepLinkPayload = {
  deepLink: string;
  screen: string;
  orderId?: string;
  [key: string]: unknown;
};

export type PushPayload = {
  userId: string;
  orderId?: string | null;
  eventType: string;
  title: string;
  body: string;
  /** Optional Closet / override deep-link payload. */
  link?: PushDeepLinkPayload;
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

  if (eventType.startsWith("ORDER_")) {
    return {
      deepLink: `worn://order/${orderId}`,
      screen: "order",
      orderId,
    };
  }

  return closetDeepLinkForEvent(eventType, { orderId }) as ClosetPushDeepLink;
}

export function pushDedupeKey(orderId: string, eventType: string) {
  return `${orderId}:${eventType}`;
}

export type StubPushServiceOptions = {
  /** Injected Expo sender (tests). Defaults to shared `sendExpoPush`. */
  sendExpo?: typeof sendExpoPush;
};

/**
 * Shared Play + Closet send path:
 * 1. Log
 * 2. Record push_events as QUEUED
 * 3. Attempt Expo delivery when the user has a pushToken → SENT/FAILED
 *    (no token leaves QUEUED — preserves existing Play stub tests)
 */
export function createStubPushService(
  repos: Repositories,
  options: StubPushServiceOptions = {},
): PushService {
  return {
    async send(payload) {
      const orderId = payload.orderId ?? null;
      const linkPayload: PushDeepLinkPayload =
        payload.link ??
        (orderId
          ? deepLinkForPushEvent(payload.eventType, orderId)
          : (closetDeepLinkForEvent(payload.eventType) as ClosetPushDeepLink));

      const dedupeKey = orderId
        ? pushDedupeKey(orderId, payload.eventType)
        : `${payload.userId}:${payload.eventType}:${linkPayload.deepLink}`;

      console.info(
        "[push]",
        payload.eventType,
        orderId ?? payload.userId,
        linkPayload.deepLink,
        payload.title,
      );

      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
        dedupeKey,
        payload: linkPayload,
        status: "QUEUED",
      });

      const user = await repos.findUserById(payload.userId);
      const delivered = await deliverQueuedPush({
        pushToken: user?.pushToken ?? null,
        title: payload.title,
        body: payload.body,
        data: linkPayload,
        sendExpo: options.sendExpo,
      });

      if (delivered.status !== "QUEUED" && repos.updatePushEventStatus) {
        await repos.updatePushEventStatus(
          event.id,
          delivered.status,
          delivered.expoTicketId ?? null,
        );
      }
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
