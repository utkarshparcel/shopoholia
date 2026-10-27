import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createInterviewKitStore,
  INTERVIEW_KIT_JOB,
  INTERVIEW_KIT_QUEUE,
  interviewKitReminderJobId,
  planInterviewKitReminder,
  scheduleInterviewKitReminder,
} from "./interview-kit.js";
import { CAL_EVENT_REMINDER_LOCAL_HOUR } from "./cal-event-outfit.js";
import { enqueueJob } from "./queues/enqueue.js";
import { createMemoryRepositories } from "./repositories/memory.js";

// The reminder must go through the C6 producer (which connects with { url: REDIS_URL }), never a
// Queue of its own: BullMQ 5 ignores a bare string `connection` and dials 127.0.0.1:6379.
vi.mock("./queues/enqueue.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  enqueueJob: vi.fn(async (_q: string, _n: string, _d: unknown, opts?: { jobId?: string }) => ({
    status: "queued" as const,
    jobId: opts?.jobId ?? "",
  })),
}));
vi.mock("bullmq", () => {
  throw new Error("interview-kit must not import bullmq directly");
});

describe("interview-kit (N40)", () => {
  let store: ReturnType<typeof createInterviewKitStore>;

  beforeEach(() => {
    store = createInterviewKitStore(createMemoryRepositories());
  });

  it("saves a kit with item ids", async () => {
    const kit = await store.save({
      userId: "user-1",
      name: "Acme onsite",
      kind: "interview",
      itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
      eventAt: "2026-09-10T09:00:00.000Z",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(kit.id).toBeTruthy();
    expect(kit.kind).toBe("interview");
    expect(kit.occasion).toBe("FORMAL");
    expect(kit.itemIds).toHaveLength(2);
    expect(await store.listByUser("user-1")).toHaveLength(1);
    expect((await store.get(kit.id, "user-1"))?.name).toBe("Acme onsite");
  });

  it("only the owner can read, change or delete a kit", async () => {
    const kit = await store.save({
      userId: "user-1",
      name: "Acme onsite",
      itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      eventAt: "2026-09-10T09:00:00.000Z",
      now: new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(await store.get(kit.id, "user-2")).toBeNull();
    expect(await store.listByUser("user-2")).toHaveLength(0);
    expect(await store.cancelReminder(kit.id, "user-2")).toBeNull();
    expect(await store.remove(kit.id, "user-2")).toBe(false);
    expect(await store.remove(kit.id, "user-1")).toBe(true);
    expect(await store.get(kit.id, "user-1")).toBeNull();
  });

  it("schedules reminder −1d (night before) relative to event", () => {
    const eventAt = "2026-09-10T09:00:00.000Z";
    const now = new Date("2026-09-01T12:00:00.000Z");
    const rem = planInterviewKitReminder(eventAt, { now });
    expect(rem).not.toBeNull();
    expect(rem!.remindAt.toISOString()).toBe(
      new Date(Date.UTC(2026, 8, 9, CAL_EVENT_REMINDER_LOCAL_HOUR, 0, 0, 0)).toISOString(),
    );
    // Exactly one calendar day before the event date
    const eventDay = new Date(eventAt).toISOString().slice(0, 10);
    const remindDay = rem!.remindAt.toISOString().slice(0, 10);
    expect(remindDay).toBe("2026-09-09");
    expect(eventDay).toBe("2026-09-10");
    expect(rem!.delayMs).toBeGreaterThan(0);
  });

  it("returns null reminder when −1d window already passed", () => {
    const rem = planInterviewKitReminder("2026-09-10T09:00:00.000Z", {
      now: new Date("2026-09-09T21:00:00.000Z"),
    });
    expect(rem).toBeNull();
  });

  it("attaches remindAt on save and marks schedule", async () => {
    const kit = await store.save({
      userId: "user-1",
      name: "Panel",
      kind: "ceremony",
      itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      eventAt: "2026-10-01T14:00:00.000Z",
      now: new Date("2026-09-20T10:00:00.000Z"),
    });
    expect(kit.remindAt).toBe(
      new Date(Date.UTC(2026, 8, 30, CAL_EVENT_REMINDER_LOCAL_HOUR, 0, 0, 0)).toISOString(),
    );
    expect(kit.reminderScheduled).toBe(false);
    const updated = await store.markReminderScheduled(kit.id, "user-1", kit.remindAt!);
    expect(updated?.reminderScheduled).toBe(true);
    // BullMQ-safe (no ":"), and a moved reminder gets a new job.
    const jobId = interviewKitReminderJobId("user-1", kit.id, kit.remindAt!);
    expect(jobId).not.toContain(":");
    expect(jobId).toBe(interviewKitReminderJobId("user-1", kit.id, kit.remindAt!));
    expect(interviewKitReminderJobId("user-1", kit.id, "2026-10-02T20:00:00.000Z")).not.toBe(jobId);
  });

  it("W056 cancel reminder and edit eventAt", async () => {
    const kit = await store.save({
      userId: "user-1",
      name: "Panel",
      itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      eventAt: "2026-10-15T10:00:00.000Z",
      now: new Date("2026-10-01T12:00:00.000Z"),
    });
    await store.markReminderScheduled(kit.id, "user-1", kit.remindAt!);
    const canceled = await store.cancelReminder(kit.id, "user-1");
    expect(canceled?.remindAt).toBeNull();
    expect(canceled?.reminderScheduled).toBe(false);

    const moved = await store.updateEvent(kit.id, "user-1", "2026-10-20T10:00:00.000Z", {
      now: new Date("2026-10-01T12:00:00.000Z"),
    });
    expect(moved?.eventAt).toBe("2026-10-20T10:00:00.000Z");
    expect(moved?.remindAt).toBe(
      new Date(Date.UTC(2026, 9, 19, CAL_EVENT_REMINDER_LOCAL_HOUR, 0, 0, 0)).toISOString(),
    );
  });

  it("schedules the reminder through the C6 producer, once per kit and remindAt", async () => {
    const mocked = vi.mocked(enqueueJob);
    mocked.mockClear();
    const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const input = {
      userId: "user-1",
      kitId: "kit-1",
      name: "Panel",
      kind: "interview" as const,
      eventAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      remindAt,
      occasion: "FORMAL" as const,
    };
    await expect(scheduleInterviewKitReminder(input)).resolves.toBe("published");
    expect(mocked).toHaveBeenCalledTimes(1);
    const [queue, name, data, opts] = mocked.mock.calls[0]!;
    expect([queue, name]).toEqual([INTERVIEW_KIT_QUEUE, INTERVIEW_KIT_JOB]);
    expect(data).toEqual(input);
    expect(opts?.jobId).toBe(interviewKitReminderJobId("user-1", "kit-1", remindAt));
    expect(opts?.delay).toBeGreaterThan(59 * 60 * 1000);

    // A reminder whose time has passed is not queued.
    mocked.mockClear();
    await expect(
      scheduleInterviewKitReminder({ ...input, remindAt: new Date(Date.now() - 1000).toISOString() }),
    ).resolves.toBe("past");
    expect(mocked).not.toHaveBeenCalled();
  });
});
