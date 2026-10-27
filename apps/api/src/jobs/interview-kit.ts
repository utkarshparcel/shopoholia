import { runClosetPushDelivery, settlePushResult, type InterviewKitReminderJob } from "@worn/shared";
import { INTERVIEW_KIT_QUEUE, interviewKitReminderJobId } from "../lib/interview-kit.js";
import type { JobDeps } from "./deps.js";

const EVENT_TYPE = "INTERVIEW_KIT_REMINDER";

/**
 * interview-kit: the night-before push for a saved interview / ceremony kit. The kit row is the
 * truth: a deleted kit, a cancelled reminder or a moved event (new remindAt) skips this job.
 */
export async function handleInterviewKitReminder(
  data: InterviewKitReminderJob,
  deps: JobDeps,
): Promise<void> {
  const now = deps.now();
  if (Date.parse(data.eventAt) <= now.getTime()) return;
  const kit = await deps.repos.findInterviewKit(data.kitId, data.userId);
  if (!kit || !kit.reminderScheduled || !kit.remindAt) return;
  const remindAt = kit.remindAt.toISOString();
  // Jobs queued before the payload carried remindAt match on the event time instead.
  const current = data.remindAt
    ? Date.parse(data.remindAt) === kit.remindAt.getTime()
    : Date.parse(data.eventAt) === kit.eventAt.getTime();
  if (!current) return;
  const user = await deps.repos.findUserById(data.userId);
  if (!user) return;
  const result = await runClosetPushDelivery({
    eventType: EVENT_TYPE,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: kit.kind === "interview" ? "Interview tomorrow" : "Ceremony tomorrow",
    body: `Your "${kit.name}" kit is saved. Lay it out tonight.`,
    payloadExtra: { kitId: kit.id, eventAt: kit.eventAt.toISOString() },
    now,
    insertQueued: async ({ title, body, payload }) => {
      const event = await deps.repos.recordPushEvent({
        userId: data.userId,
        orderId: null,
        eventType: EVENT_TYPE,
        dedupeKey: interviewKitReminderJobId(data.userId, data.kitId, remindAt),
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
  settlePushResult(INTERVIEW_KIT_QUEUE, result);
}
