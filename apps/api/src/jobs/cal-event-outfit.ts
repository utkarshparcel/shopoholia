import { runClosetPushDelivery, settlePushResult, type CalEventOutfitJob } from "@worn/shared";
import { CAL_EVENT_OUTFIT_QUEUE, calEventReminderJobId } from "../lib/cal-event-outfit.js";
import type { JobDeps } from "./deps.js";

const EVENT_TYPE = "OUTFIT_READY";

/**
 * cal-event-outfit: the night-before push for a calendar event. Says "outfit ready" only when
 * an outfit is planned for that day. The push row's key is the one POST /outfits/from-calendar
 * writes when it schedules the reminder, so the reminder sends that row instead of adding one.
 */
export async function handleCalEventOutfit(data: CalEventOutfitJob, deps: JobDeps): Promise<void> {
  const now = deps.now();
  // The event has started (the worker was down past it): a night-before reminder is no use now.
  if (Date.parse(data.startAt) <= now.getTime()) return;
  const user = await deps.repos.findUserById(data.userId);
  if (!user) return;
  const outfit = await deps.repos.getOutfitForDate(data.userId, data.plannedFor);
  const occasion = data.occasion.toLowerCase();
  const result = await runClosetPushDelivery({
    eventType: EVENT_TYPE,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: outfit ? `Outfit ready for ${data.title}` : `Tomorrow: ${data.title}`,
    body: outfit
      ? `Your ${occasion} look for tomorrow is in Today.`
      : `Pick a ${occasion} look for tomorrow in Today.`,
    deepLinkExtra: { outfitId: outfit?.id },
    payloadExtra: { plannedFor: data.plannedFor, occasion: data.occasion },
    now,
    insertQueued: async ({ title, body, payload }) => {
      const event = await deps.repos.recordPushEvent({
        userId: data.userId,
        orderId: null,
        eventType: EVENT_TYPE,
        dedupeKey: calEventReminderJobId(data.userId, `${data.eventId ?? data.plannedFor}:${data.title}`),
        title,
        body,
        payload,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await deps.repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
  settlePushResult(CAL_EVENT_OUTFIT_QUEUE, result);
}
