import { describe, expect, it, beforeEach } from "vitest";
import {
  createInterviewKitStore,
  interviewKitReminderJobId,
  planInterviewKitReminder,
} from "./interview-kit.js";
import { CAL_EVENT_REMINDER_LOCAL_HOUR } from "./cal-event-outfit.js";

describe("interview-kit (N40)", () => {
  const store = createInterviewKitStore();

  beforeEach(() => {
    store.clear();
  });

  it("saves a kit with item ids", () => {
    const kit = store.save({
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
    expect(store.listByUser("user-1")).toHaveLength(1);
    expect(store.get(kit.id)?.name).toBe("Acme onsite");
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

  it("attaches remindAt on save and marks schedule", () => {
    const kit = store.save({
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
    const updated = store.markReminderScheduled(kit.id, kit.remindAt!);
    expect(updated?.reminderScheduled).toBe(true);
    expect(interviewKitReminderJobId("user-1", kit.id)).toBe(`interview-kit:user-1:${kit.id}`);
  });

  it("W056 cancel reminder and edit eventAt", () => {
    const kit = store.save({
      userId: "user-1",
      name: "Panel",
      itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      eventAt: "2026-10-15T10:00:00.000Z",
      now: new Date("2026-10-01T12:00:00.000Z"),
    });
    store.markReminderScheduled(kit.id, kit.remindAt!);
    const canceled = store.cancelReminder(kit.id);
    expect(canceled?.remindAt).toBeNull();
    expect(canceled?.reminderScheduled).toBe(false);

    const moved = store.updateEvent(kit.id, "2026-10-20T10:00:00.000Z", {
      now: new Date("2026-10-01T12:00:00.000Z"),
    });
    expect(moved?.eventAt).toBe("2026-10-20T10:00:00.000Z");
    expect(moved?.remindAt).toBe(
      new Date(Date.UTC(2026, 9, 19, CAL_EVENT_REMINDER_LOCAL_HOUR, 0, 0, 0)).toISOString(),
    );
  });
});
