import { and, eq } from "drizzle-orm";
import {
  localDateKey,
  resolveTimeZone,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { pushEvents, recordPushEventIfNew, returnRequests, users, type Db } from "@worn/db";
import type { ReturnDeadlinePayload } from "./queues.js";

export const RETURN_DEADLINE_EVENT = "RETURN_DEADLINE";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
  /** Signs `payload.imageKey` at send time (r2ImageSignerFromEnv); without it the push uses imageUrl. */
  signImageKey?: ((key: string) => string) | null;
};

/** The item image signed now, so the link is fresh when the push lands; else the fallback URL. */
function pushImageUrl(payload: ReturnDeadlinePayload, opts: ClosetPushHandlerOpts): string | undefined {
  if (payload.imageKey && opts.signImageKey) {
    try {
      return opts.signImageKey(payload.imageKey);
    } catch {
      // fall back to the long-lived URL
    }
  }
  return payload.imageUrl;
}

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      prefs: users.prefs,
      timeZone: users.timeZone,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/** The reminder is for this return and this deadline only, while nothing has been started. */
async function isStillOpen(db: Db, payload: ReturnDeadlinePayload): Promise<boolean> {
  const [row] = await db
    .select({ state: returnRequests.state, windowDeadline: returnRequests.windowDeadline })
    .from(returnRequests)
    .where(and(eq(returnRequests.id, payload.returnId), eq(returnRequests.userId, payload.userId)))
    .limit(1);
  if (!row || row.state !== "REQUESTED") return false;
  return row.windowDeadline.getTime() === new Date(payload.windowDeadline).getTime();
}

export async function processReturnDeadline(
  payload: ReturnDeadlinePayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  // Initiated, refunded or cancelled since, or the deadline moved (that has its own job).
  if (!(await isStillOpen(db, payload))) return { status: "skipped" };
  const user = await loadUser(db, payload.userId);
  // Account erased since the return was logged: nobody to tell.
  if (!user) return { status: "skipped" };
  const now = opts.now ?? new Date();
  const deadline = new Date(payload.windowDeadline);
  // A quiet-hours delay can carry the job past the deadline: the window is shut, say nothing.
  if (deadline.getTime() <= now.getTime()) return { status: "skipped" };
  const tz = resolveTimeZone(user.timeZone);
  // Calendar days on the user's wall clock: a deadline 3 hours away is "today", not "tomorrow".
  const daysLeft = Math.round(
    (Date.parse(`${localDateKey(deadline, tz)}T00:00:00Z`) - Date.parse(`${localDateKey(now, tz)}T00:00:00Z`)) /
      86_400_000,
  );
  const title =
    daysLeft <= 0
      ? "Return window closes today"
      : daysLeft === 1
        ? "Return window closes tomorrow"
        : `Return window closes in ${daysLeft} days`;
  // The date on the user's wall clock, not the server's.
  const body = `Your return for ${payload.merchant} closes on ${deadline.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: tz,
  })}. Initiate now.`;

  return runClosetPushDelivery({
    eventType: RETURN_DEADLINE_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
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
      imageUrl: pushImageUrl(payload, opts),
      amountMinor: payload.amountMinor,
      currency: payload.currency,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const event = await recordPushEventIfNew(db, {
        userId: payload.userId,
        orderId: null,
        eventType: RETURN_DEADLINE_EVENT,
        dedupeKey: `return-deadline:${payload.returnId}:${payload.windowDeadline}`,
        title: t,
        body: b,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}
