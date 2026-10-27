/**
 * N40 — Interview / ceremony kit: saved looks + night-before (−1d) reminder.
 */

import { randomUUID } from "node:crypto";
import {
  CAL_EVENT_REMINDER_LOCAL_HOUR,
  computeNightBeforeReminder,
  type OutfitOccasion,
} from "./cal-event-outfit.js";

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

export type InterviewKitStore = {
  save(input: {
    userId: string;
    name: string;
    kind?: InterviewKitKind;
    itemIds: string[];
    eventAt: string;
    occasion?: OutfitOccasion;
    now?: Date;
  }): InterviewKitRecord;
  get(id: string): InterviewKitRecord | null;
  listByUser(userId: string): InterviewKitRecord[];
  markReminderScheduled(id: string, remindAt: string): InterviewKitRecord | null;
  /** W056 — clear night-before reminder. */
  cancelReminder(id: string): InterviewKitRecord | null;
  /** W056 — move event (recomputes remindAt). */
  updateEvent(id: string, eventAt: string, opts?: { now?: Date }): InterviewKitRecord | null;
  remove(id: string): boolean;
  clear(): void;
};

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

/** Stable BullMQ job id for kit reminders. */
export function interviewKitReminderJobId(userId: string, kitId: string): string {
  return `interview-kit:${userId}:${kitId}`;
}

export const INTERVIEW_KIT_QUEUE = "interview-kit";
export const INTERVIEW_KIT_JOB = "interview-kit-reminder";

/**
 * Best-effort enqueue of night-before kit reminder (−1d).
 * Skips when Redis is unavailable or the reminder window has passed.
 */
export async function scheduleInterviewKitReminder(input: {
  userId: string;
  kitId: string;
  name: string;
  kind: InterviewKitKind;
  eventAt: string;
  remindAt: string;
  occasion: OutfitOccasion;
}): Promise<"published" | "skipped"> {
  const redisUrl = process.env.WARDROBE_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const delayMs = new Date(input.remindAt).getTime() - Date.now();
  if (delayMs <= 0) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(INTERVIEW_KIT_QUEUE, { connection: redisUrl });
    await queue.add(
      INTERVIEW_KIT_JOB,
      {
        userId: input.userId,
        kitId: input.kitId,
        name: input.name,
        kind: input.kind,
        eventAt: input.eventAt,
        occasion: input.occasion,
      },
      {
        delay: Math.max(100, delayMs),
        jobId: interviewKitReminderJobId(input.userId, input.kitId),
      },
    );
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[interview-kit] reminder enqueue failed", String(err));
    return "skipped";
  }
}

/** Ephemeral in-process kit store (N40). Fine for beta; swap for Postgres later. */
export function createInterviewKitStore(): InterviewKitStore {
  const byId = new Map<string, InterviewKitRecord>();

  return {
    save(input) {
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
      const id = randomUUID();
      const iso = now.toISOString();
      const record: InterviewKitRecord = {
        id,
        userId: input.userId,
        name: input.name.trim() || (kind === "interview" ? "Interview kit" : "Ceremony kit"),
        kind,
        itemIds: [...input.itemIds],
        eventAt: event.toISOString(),
        occasion: input.occasion ?? defaultOccasionForKitKind(kind),
        remindAt: rem?.remindAt.toISOString() ?? null,
        reminderScheduled: false,
        createdAt: iso,
        updatedAt: iso,
      };
      byId.set(id, record);
      return record;
    },
    get(id) {
      return byId.get(id) ?? null;
    },
    listByUser(userId) {
      return [...byId.values()]
        .filter((k) => k.userId === userId)
        .sort((a, b) => a.eventAt.localeCompare(b.eventAt));
    },
    markReminderScheduled(id, remindAt) {
      const kit = byId.get(id);
      if (!kit) return null;
      const updated: InterviewKitRecord = {
        ...kit,
        remindAt,
        reminderScheduled: true,
        updatedAt: new Date().toISOString(),
      };
      byId.set(id, updated);
      return updated;
    },
    cancelReminder(id) {
      const kit = byId.get(id);
      if (!kit) return null;
      const updated: InterviewKitRecord = {
        ...kit,
        remindAt: null,
        reminderScheduled: false,
        updatedAt: new Date().toISOString(),
      };
      byId.set(id, updated);
      return updated;
    },
    updateEvent(id, eventAt, opts) {
      const kit = byId.get(id);
      if (!kit) return null;
      const event = new Date(eventAt);
      if (Number.isNaN(event.getTime())) {
        throw new Error("Invalid eventAt");
      }
      const now = opts?.now ?? new Date();
      const rem = planInterviewKitReminder(event, { now });
      const updated: InterviewKitRecord = {
        ...kit,
        eventAt: event.toISOString(),
        remindAt: rem?.remindAt.toISOString() ?? null,
        reminderScheduled: false,
        updatedAt: now.toISOString(),
      };
      byId.set(id, updated);
      return updated;
    },
    remove(id) {
      return byId.delete(id);
    },
    clear() {
      byId.clear();
    },
  };
}

export const interviewKitStore = createInterviewKitStore();
