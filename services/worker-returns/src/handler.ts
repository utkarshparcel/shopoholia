import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { pushEvents, users, type Db } from "@worn/db";
import type { ReturnDeadlinePayload } from "./queues.js";

export const RETURN_DEADLINE_EVENT = "RETURN_DEADLINE";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      consentFlags: users.consentFlags,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? { consentFlags: {} as Record<string, unknown>, pushToken: null };
}

export async function processReturnDeadline(
  payload: ReturnDeadlinePayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const user = await loadUser(db, payload.userId);
  const daysLeft = Math.ceil(
    (new Date(payload.windowDeadline).getTime() - (opts.now ?? new Date()).getTime()) /
      86_400_000,
  );
  const title =
    daysLeft <= 1
      ? "Return window closes tomorrow"
      : `Return window closes in ${daysLeft} days`;
  const body = `Your return for ${payload.merchant} closes on ${new Date(
    payload.windowDeadline,
  ).toLocaleDateString()}. Initiate now.`;

  return runClosetPushDelivery({
    eventType: RETURN_DEADLINE_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title,
    body,
    deepLinkExtra: { returnId: payload.returnId },
    payloadExtra: {
      returnId: payload.returnId,
      merchant: payload.merchant,
      windowDeadline: payload.windowDeadline,
    },
    rich: {
      imageUrl: payload.imageUrl,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: RETURN_DEADLINE_EVENT,
        dedupeKey: `return-deadline:${payload.returnId}`,
        title: t,
        body: b,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}
