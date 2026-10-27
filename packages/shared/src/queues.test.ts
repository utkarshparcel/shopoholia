import { describe, expect, it, vi } from "vitest";
import {
  createJobProcessor,
  deadLetterData,
  DeferJobError,
  deferJob,
  EmiDueJobSchema,
  isFinalAttempt,
  jobIdFrom,
  type DeadLetter,
  type ProcessableJob,
} from "./queues.js";

class DelayedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "DelayedError";
  }
}
class UnrecoverableError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "UnrecoverableError";
  }
}
const errors = { DelayedError, UnrecoverableError };

function fakeJob(over: Partial<ProcessableJob> = {}): ProcessableJob & {
  moveToDelayed: ReturnType<typeof vi.fn>;
} {
  return {
    id: "job-1",
    name: "emi-due-nudge",
    data: {},
    attemptsMade: 0,
    opts: { attempts: 3 },
    moveToDelayed: vi.fn(async () => undefined),
    ...over,
  } as ProcessableJob & { moveToDelayed: ReturnType<typeof vi.fn> };
}

const emi = {
  planId: "plan-1",
  userId: "user-1",
  provider: "SIMPL",
  merchant: "Myntra",
  remainingMinor: 300_00,
  installmentMinor: 100_00,
  dueOn: "2026-11-02",
  currency: "INR",
};

describe("jobIdFrom (shared copy)", () => {
  it("escapes BullMQ's separator and never yields an integer", () => {
    expect(jobIdFrom("emi", "plan:1", "2026-11-02")).toBe("emi|plan%3A1|2026-11-02");
    expect(jobIdFrom("a|b", "50%")).toBe("a%7Cb|50%25");
    expect(() => jobIdFrom()).toThrow(RangeError);
    expect(() => jobIdFrom("")).toThrow(RangeError);
    expect(() => jobIdFrom(42)).toThrow(RangeError);
  });
});

describe("deadLetterData", () => {
  it("keeps ids, dates, enums and numbers; drops free text and nested objects", () => {
    expect(
      deadLetterData({
        ...emi,
        title: "Your Myntra EMI",
        lentTo: "Priya",
        code: "4/0AX-oauth-code",
        message: { body: "receipt" },
        itemIds: ["a", "b"],
      }),
    ).toEqual({
      planId: "plan-1",
      userId: "user-1",
      provider: "SIMPL",
      remainingMinor: 300_00,
      installmentMinor: 100_00,
      dueOn: "2026-11-02",
      currency: "INR",
      itemIds: ["a", "b"],
    });
    expect(deadLetterData(null)).toEqual({});
    expect(deadLetterData([1, 2])).toEqual({});
  });
});

describe("isFinalAttempt", () => {
  it("is the last of opts.attempts, or any UnrecoverableError", () => {
    expect(isFinalAttempt({ attemptsMade: 0, opts: { attempts: 3 } }, new Error("x"))).toBe(false);
    expect(isFinalAttempt({ attemptsMade: 2, opts: { attempts: 3 } }, new Error("x"))).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 0, opts: {} }, new Error("x"))).toBe(true);
    expect(isFinalAttempt({ attemptsMade: 0, opts: { attempts: 3 } }, new UnrecoverableError())).toBe(true);
  });
});

describe("createJobProcessor", () => {
  function setup(handle: (data: unknown) => Promise<void>, timeoutMs?: number) {
    const letters: DeadLetter[] = [];
    const alerts: unknown[] = [];
    const processor = createJobProcessor({
      queue: "emi-due",
      schema: EmiDueJobSchema,
      handle: async (data) => handle(data),
      timeoutMs,
      recordDeadLetter: async (entry) => {
        letters.push(entry);
      },
      onDeadLetter: (_entry, err) => alerts.push(err),
      errors,
      now: () => Date.parse("2026-10-27T10:00:00Z"),
    });
    return { processor, letters, alerts };
  }

  it("runs the handler with the parsed payload", async () => {
    const handle = vi.fn(async () => undefined);
    const { processor, letters } = setup(handle);
    await processor(fakeJob({ data: emi }), "tok");
    expect(handle).toHaveBeenCalledWith(emi);
    expect(letters).toEqual([]);
  });

  it("dead-letters a bad payload at once as unrecoverable", async () => {
    const handle = vi.fn(async () => undefined);
    const { processor, letters, alerts } = setup(handle);
    await expect(
      processor(fakeJob({ data: { ...emi, dueOn: "soon" } }), "tok"),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(handle).not.toHaveBeenCalled();
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ queue: "emi-due", jobId: "job-1", attemptsMade: 1 });
    expect(letters[0]!.error).toContain("dueOn");
    expect(alerts).toHaveLength(1);
  });

  it("rethrows without a dead letter while attempts remain, and writes one on the last", async () => {
    const { processor, letters } = setup(async () => {
      throw new Error("db down");
    });
    await expect(processor(fakeJob({ data: emi, attemptsMade: 0 }), "tok")).rejects.toThrow("db down");
    await expect(processor(fakeJob({ data: emi, attemptsMade: 1 }), "tok")).rejects.toThrow("db down");
    expect(letters).toEqual([]);
    await expect(processor(fakeJob({ data: emi, attemptsMade: 2 }), "tok")).rejects.toThrow("db down");
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({
      jobName: "emi-due-nudge",
      error: "Error: db down",
      attemptsMade: 3,
      data: { planId: "plan-1", userId: "user-1", dueOn: "2026-11-02" },
    });
    expect(letters[0]!.data).not.toHaveProperty("merchant");
  });

  it("defers without spending an attempt", async () => {
    const { processor, letters } = setup(async () => deferJob(5_000));
    const job = fakeJob({ data: emi, attemptsMade: 2 });
    await expect(processor(job, "tok")).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-10-27T10:00:05Z"), "tok");
    expect(letters).toEqual([]);
    expect(new DeferJobError(1).name).toBe("DeferJobError");
  });

  it("bounds an attempt in time", async () => {
    const { processor, letters } = setup(() => new Promise(() => undefined), 20);
    await expect(processor(fakeJob({ data: emi, attemptsMade: 2 }), "tok")).rejects.toThrow(
      "emi-due job timed out after 20ms",
    );
    expect(letters).toHaveLength(1);
  });

  it("still fails the job and alerts when the dead-letter sink is down", async () => {
    const alerts: unknown[] = [];
    const processor = createJobProcessor({
      queue: "emi-due",
      handle: async () => {
        throw new Error("boom");
      },
      recordDeadLetter: async () => {
        throw new Error("pg down");
      },
      onDeadLetter: (_e, err) => alerts.push(String(err)),
      errors,
    });
    await expect(processor(fakeJob({ data: emi, attemptsMade: 2 }))).rejects.toThrow("boom");
    expect(alerts).toEqual(["Error: pg down", "Error: boom"]);
  });
});
