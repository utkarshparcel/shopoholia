import { DeferJobError, settlePushResult } from "@worn/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCalEventOutfit } from "./cal-event-outfit.js";
import type { JobDeps } from "./deps.js";
import { handleIngestDeadLetter } from "./ingest-dead-letter.js";
import { handleInterviewKitReminder } from "./interview-kit.js";
import { JOB_HANDLERS, JOB_SCHEDULES } from "./registry.js";
import { defineJob, validateJobRegistry } from "./runner.js";
import { z } from "zod";

type Row = { id: string; status: "QUEUED" | "SENT" | "FAILED"; dedupeKey: string; title: string };

function fakeRepos(opts: { outfit?: { id: string } | null; pushToken?: string | null } = {}) {
  const rows = new Map<string, Row>();
  return {
    rows,
    findUserById: vi.fn(async (id: string) => ({
      id,
      prefs: {},
      timeZone: "Asia/Kolkata",
      pushToken: opts.pushToken === undefined ? "ExponentPushToken[abc]" : opts.pushToken,
    })),
    getOutfitForDate: vi.fn(async () => opts.outfit ?? null),
    recordPushEvent: vi.fn(async (input: { dedupeKey: string; title: string }) => {
      const existing = rows.get(input.dedupeKey);
      if (existing) return existing;
      const row: Row = { id: `pe-${rows.size + 1}`, status: "QUEUED", ...input };
      rows.set(input.dedupeKey, row);
      return row;
    }),
    updatePushEventStatus: vi.fn(async (id: string, status: "SENT" | "FAILED") => {
      for (const row of rows.values()) if (row.id === id) row.status = status;
    }),
  };
}

function depsWith(repos: unknown, now: Date): JobDeps {
  return {
    repos: repos as JobDeps["repos"],
    storage: {} as JobDeps["storage"],
    log: { info: vi.fn(), error: vi.fn() } as unknown as JobDeps["log"],
    recordDeadLetter: vi.fn(async () => undefined),
    now: () => now,
  };
}

const expoOk = () =>
  new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-1" }] }), { status: 200 });

describe("settlePushResult", () => {
  it("defers quiet hours, throws on a failed send, completes the rest", () => {
    expect(() => settlePushResult("q", { status: "delayed", delayMs: 5_000 })).toThrow(DeferJobError);
    expect(() => settlePushResult("q", { status: "failed" })).toThrow("q: push delivery failed");
    for (const status of ["sent", "queued", "skipped"] as const) {
      expect(() => settlePushResult("q", { status })).not.toThrow();
    }
  });
});

describe("handleCalEventOutfit", () => {
  // 20:30 IST the night before a 10:30 IST event: outside the default 22:00-07:00 quiet hours.
  const now = new Date("2026-09-09T15:00:00.000Z");
  const data = {
    userId: "u1",
    eventId: "evt-1",
    title: "Board review",
    occasion: "FORMAL",
    plannedFor: "2026-09-10",
    startAt: "2026-09-10T05:00:00.000Z",
  };
  const fetchMock = vi.fn(async () => expoOk());

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends 'outfit ready' once when run twice, on the row the route wrote", async () => {
    const repos = fakeRepos({ outfit: { id: "o1" } });
    const deps = depsWith(repos, now);
    await handleCalEventOutfit(data, deps);
    await handleCalEventOutfit(data, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Same key as POST /outfits/from-calendar's queued row (routes/outfits.ts).
    const row = repos.rows.get("cal-outfit:u1:evt-1:Board review");
    expect(row).toMatchObject({ status: "SENT", title: "Outfit ready for Board review" });
  });

  it("does not claim an outfit when none is planned for that day", async () => {
    const repos = fakeRepos({ outfit: null });
    await handleCalEventOutfit(data, depsWith(repos, now));
    expect([...repos.rows.values()][0]?.title).toBe("Tomorrow: Board review");
  });

  it("skips an event that has already started (the job ran late)", async () => {
    const repos = fakeRepos();
    await handleCalEventOutfit(data, depsWith(repos, new Date("2026-09-10T06:00:00.000Z")));
    expect(repos.findUserById).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defers inside quiet hours instead of sending", async () => {
    const repos = fakeRepos();
    // 23:00 IST.
    const late = new Date("2026-09-09T17:30:00.000Z");
    await expect(handleCalEventOutfit(data, depsWith(repos, late))).rejects.toBeInstanceOf(DeferJobError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a failed send so BullMQ retries, and the retry sends it", async () => {
    const repos = fakeRepos({ outfit: { id: "o1" } });
    const deps = depsWith(repos, now);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(handleCalEventOutfit(data, deps)).rejects.toThrow("push delivery failed");
    expect([...repos.rows.values()][0]?.status).toBe("FAILED");
    await handleCalEventOutfit(data, deps);
    expect([...repos.rows.values()][0]?.status).toBe("SENT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("handleInterviewKitReminder", () => {
  const now = new Date("2026-09-09T15:00:00.000Z");
  const data = {
    userId: "u1",
    kitId: "kit-1",
    name: "Design interview",
    kind: "interview" as const,
    eventAt: "2026-09-10T05:00:00.000Z",
    remindAt: "2026-09-09T14:30:00.000Z",
    occasion: "FORMAL",
  };
  const kit = {
    id: "kit-1",
    userId: "u1",
    name: "Design interview",
    kind: "interview" as const,
    eventAt: new Date(data.eventAt),
    remindAt: new Date(data.remindAt) as Date | null,
    reminderScheduled: true,
  };
  const withKit = (k: typeof kit | null) => ({
    ...fakeRepos(),
    findInterviewKit: vi.fn(async () => k),
  });
  const fetchMock = vi.fn(async () => expoOk());

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends once when run twice", async () => {
    const repos = withKit(kit);
    const deps = depsWith(repos, now);
    await handleInterviewKitReminder(data, deps);
    await handleInterviewKitReminder(data, deps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...repos.rows.values()][0]).toMatchObject({ title: "Interview tomorrow", status: "SENT" });
  });

  it("skips a deleted kit, a cancelled reminder and a moved event", async () => {
    for (const k of [
      null,
      { ...kit, reminderScheduled: false, remindAt: null },
      { ...kit, eventAt: new Date("2026-09-10T08:00:00.000Z"), remindAt: new Date("2026-09-09T17:30:00.000Z") },
    ]) {
      const repos = withKit(k);
      await handleInterviewKitReminder(data, depsWith(repos, now));
      expect(repos.findUserById).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches a job queued without remindAt on the event time", async () => {
    const repos = withKit(kit);
    await handleInterviewKitReminder({ ...data, remindAt: undefined }, depsWith(repos, now));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a kit whose event has passed", async () => {
    const repos = withKit(kit);
    await handleInterviewKitReminder(data, depsWith(repos, new Date("2026-09-11T00:00:00.000Z")));
    expect(repos.findInterviewKit).not.toHaveBeenCalled();
    expect(repos.findUserById).not.toHaveBeenCalled();
  });
});

describe("handleIngestDeadLetter", () => {
  it("stores ids only, under the ingest queue, with a stable id", async () => {
    const deps = depsWith({}, new Date());
    const data = {
      kind: "EMAIL" as const,
      sourceId: "src-1",
      documentId: "doc-1",
      error: "parse failed",
      attempts: 3,
      timestamp: "2026-10-26T10:00:00.000Z",
    };
    await handleIngestDeadLetter(data, deps);
    await handleIngestDeadLetter(data, deps);
    const calls = vi.mocked(deps.recordDeadLetter).mock.calls.map(([entry]) => entry);
    expect(calls[0]).toEqual({
      queue: "ingest-email",
      jobId: "ingest|EMAIL|doc-1",
      jobName: "ingest-email",
      data: { sourceId: "src-1", documentId: "doc-1", kind: "EMAIL", attempts: 3 },
      error: "parse failed",
      attemptsMade: 3,
      failedAt: new Date("2026-10-26T10:00:00.000Z"),
    });
    // Rerun: same row key (the db upserts on queue + job id).
    expect(calls[1]?.jobId).toBe(calls[0]?.jobId);
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "EMAIL", documentId: "doc-1" }),
      "[ingest] job dead-lettered",
    );
  });

  it("keeps the worker's own job id when it sends one", async () => {
    const deps = depsWith({}, new Date());
    await handleIngestDeadLetter(
      { kind: "RESYNC", jobId: "resync|src-1", error: "x", attempts: 3, timestamp: "2026-10-26T10:00:00.000Z" },
      deps,
    );
    expect(vi.mocked(deps.recordDeadLetter).mock.calls[0]?.[0].jobId).toBe("resync|src-1");
  });
});

describe("job registry", () => {
  it("has a handler for every queue that had none, and a handler for every schedule", () => {
    expect(() => validateJobRegistry(JOB_HANDLERS, JOB_SCHEDULES)).not.toThrow();
    expect(JOB_HANDLERS.map((h) => h.queue).sort()).toEqual([
      "cal-event-outfit",
      "cooling-off-release",
      "emi-due",
      "ingest-dead-letter",
      "interview-kit",
      "lent-overdue",
      "price-drop",
      "retention-sweep",
    ]);
    expect(JOB_SCHEDULES).toContainEqual(
      expect.objectContaining({ queue: "retention-sweep", pattern: "0 3 * * *", tz: "Asia/Kolkata" }),
    );
  });

  it("rejects a queue registered twice, a schedule without a handler, a repeated schedule id", () => {
    const job = defineJob({ queue: "a", schema: z.object({}), handle: async () => undefined });
    const schedule = { id: "s", queue: "a", jobName: "a", pattern: "0 * * * *", tz: "Asia/Kolkata" };
    expect(() => validateJobRegistry([job, job], [])).toThrow(/registered twice/);
    expect(() => validateJobRegistry([job], [{ ...schedule, queue: "b" }])).toThrow(/no handler/);
    expect(() => validateJobRegistry([job], [schedule, schedule])).toThrow(/used twice/);
  });
});
