/**
 * N40 — Interview / ceremony kit: saved looks + night-before (−1d) reminder.
 */

import { randomUUID } from "node:crypto";
import {
  CAL_EVENT_REMINDER_LOCAL_HOUR,
  computeNightBeforeReminder,
  type OutfitOccasion,
} from "./cal-event-outfit.js";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";
import type { InterviewKitRecord as InterviewKitRow, Repositories } from "./repositories/types.js";

export type InterviewKitKind = "interview" | "ceremony";

export type InterviewKitRecord = {
  id: string;
  userId: string;
  name: string;
  kind: InterviewKitKind;
  itemIds: string[];
  /** Event start ISO datetime. */
  eventAt: string;
  occasion: OutfitOccasion;
  remindAt: string | null;
  reminderScheduled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Every lookup is by id and owner: another user's kit reads as missing. */
export type InterviewKitStore = {
  save(input: {
    userId: string;
    name: string;
    kind?: InterviewKitKind;
    itemIds: string[];
    eventAt: string;
    occasion?: OutfitOccasion;
    now?: Date;
  }): Promise<InterviewKitRecord>;
  get(id: string, userId: string): Promise<InterviewKitRecord | null>;
  listByUser(userId: string): Promise<InterviewKitRecord[]>;
  markReminderScheduled(id: string, userId: string, remindAt: string): Promise<InterviewKitRecord | null>;
  /** W056 — clear night-before reminder. */
  cancelReminder(id: string, userId: string): Promise<InterviewKitRecord | null>;
  /** W056 — move event (recomputes remindAt). */
  updateEvent(
    id: string,
    userId: string,
    eventAt: string,
    opts?: { now?: Date },
  ): Promise<InterviewKitRecord | null>;
  remove(id: string, userId: string): Promise<boolean>;
};

/** Kits listed per user (newest events last). */
const MAX_KITS_LISTED = 200;

export function defaultOccasionForKitKind(kind: InterviewKitKind): OutfitOccasion {
  return kind === "interview" ? "FORMAL" : "FORMAL";
}

/**
 * Night-before (−1 calendar day) reminder window for a saved kit.
 * Returns null when the window has already passed.
 */
export function planInterviewKitReminder(
  eventAt: string | Date,
  opts?: { now?: Date; hour?: number },
): { remindAt: Date; delayMs: number } | null {
  return computeNightBeforeReminder(eventAt, {
    now: opts?.now,
    hour: opts?.hour ?? CAL_EVENT_REMINDER_LOCAL_HOUR,
  });
}

/**
 * Stable BullMQ job id for one kit reminder. It includes remindAt, so moving the event queues a
 * new reminder; the worker skips a job whose remindAt no longer matches the kit.
 */
export function interviewKitReminderJobId(userId: string, kitId: string, remindAt: string): string {
  return jobIdFrom("interview-kit", userId, kitId, remindAt);
}

export const INTERVIEW_KIT_QUEUE = "interview-kit";
export const INTERVIEW_KIT_JOB = "interview-kit-reminder";

/**
 * Queues the night-before kit reminder (−1d) through the C6 producer. "past" when the window
 * has gone; "skipped" only outside production without REDIS_URL (enqueueJob logs it). A Redis
 * failure throws QueueUnavailableError, so callers can say the reminder is not set.
 */
export async function scheduleInterviewKitReminder(input: {
  userId: string;
  kitId: string;
  name: string;
  kind: InterviewKitKind;
  eventAt: string;
  remindAt: string;
  occasion: OutfitOccasion;
}): Promise<"published" | "skipped" | "past"> {
  const delayMs = new Date(input.remindAt).getTime() - Date.now();
  if (delayMs <= 0) return "past";
  const result = await enqueueJob(
    INTERVIEW_KIT_QUEUE,
    INTERVIEW_KIT_JOB,
    {
      userId: input.userId,
      kitId: input.kitId,
      name: input.name,
      kind: input.kind,
      eventAt: input.eventAt,
      remindAt: input.remindAt,
      occasion: input.occasion,
    },
    {
      delay: Math.max(100, delayMs),
      jobId: interviewKitReminderJobId(input.userId, input.kitId, input.remindAt),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}

function toKit(row: InterviewKitRow): InterviewKitRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind,
    itemIds: row.itemIds,
    eventAt: row.eventAt.toISOString(),
    occasion: (row.occasion ?? defaultOccasionForKitKind(row.kind)) as OutfitOccasion,
    remindAt: row.remindAt?.toISOString() ?? null,
    reminderScheduled: row.reminderScheduled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Interview / ceremony kits in Postgres (`interview_kits`, N40). */
export function createInterviewKitStore(repos: Repositories): InterviewKitStore {
  const patch = async (
    id: string,
    userId: string,
    p: Parameters<Repositories["updateInterviewKit"]>[2],
  ) => {
    const row = await repos.updateInterviewKit(id, userId, p);
    return row ? toKit(row) : null;
  };

  return {
    async save(input) {
      const now = input.now ?? new Date();
      const kind = input.kind ?? "interview";
      const event = new Date(input.eventAt);
      if (Number.isNaN(event.getTime())) {
        throw new Error("Invalid eventAt");
      }
      if (!input.itemIds.length) {
        throw new Error("itemIds required");
      }
      const rem = planInterviewKitReminder(event, { now });
      const row = await repos.createInterviewKit({
        id: randomUUID(),
        userId: input.userId,
        name: input.name.trim() || (kind === "interview" ? "Interview kit" : "Ceremony kit"),
        kind,
        itemIds: [...input.itemIds],
        eventAt: event,
        occasion: input.occasion ?? defaultOccasionForKitKind(kind),
        remindAt: rem?.remindAt ?? null,
        reminderScheduled: false,
      });
      return toKit(row);
    },
    async get(id, userId) {
      const row = await repos.findInterviewKit(id, userId);
      return row ? toKit(row) : null;
    },
    async listByUser(userId) {
      return (await repos.listInterviewKits(userId, MAX_KITS_LISTED)).map(toKit);
    },
    markReminderScheduled(id, userId, remindAt) {
      return patch(id, userId, { remindAt: new Date(remindAt), reminderScheduled: true });
    },
    cancelReminder(id, userId) {
      return patch(id, userId, { remindAt: null, reminderScheduled: false });
    },
    async updateEvent(id, userId, eventAt, opts) {
      const event = new Date(eventAt);
      if (Number.isNaN(event.getTime())) {
        throw new Error("Invalid eventAt");
      }
      const rem = planInterviewKitReminder(event, { now: opts?.now ?? new Date() });
      return patch(id, userId, {
        eventAt: event,
        remindAt: rem?.remindAt ?? null,
        reminderScheduled: false,
      });
    },
    remove(id, userId) {
      return repos.deleteInterviewKit(id, userId);
    },
  };
}
