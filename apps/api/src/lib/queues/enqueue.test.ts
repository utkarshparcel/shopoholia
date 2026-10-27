import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake BullMQ: records constructions and adds; `addImpl` decides what add does.
const fake = vi.hoisted(() => ({
  constructed: [] as Array<{ name: string; opts: Record<string, unknown> }>,
  adds: [] as Array<{ queue: string; name: string; data: unknown; opts: Record<string, unknown> }>,
  closed: [] as string[],
  addImpl: null as null | ((opts: Record<string, unknown>) => Promise<{ id?: string }>),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(
      readonly name: string,
      opts: Record<string, unknown>,
    ) {
      fake.constructed.push({ name, opts });
    }
    on() {
      return this;
    }
    async add(name: string, data: unknown, opts: Record<string, unknown>) {
      fake.adds.push({ queue: this.name, name, data, opts });
      return fake.addImpl ? fake.addImpl(opts) : { id: (opts.jobId as string) ?? "1" };
    }
    async close() {
      fake.closed.push(this.name);
    }
  },
}));

const { QueueUnavailableError, closeQueues, enqueueJob, jobIdFrom } = await import("./enqueue.js");

const env = { REDIS_URL: process.env.REDIS_URL, NODE_ENV: process.env.NODE_ENV };

beforeEach(() => {
  fake.constructed.length = 0;
  fake.adds.length = 0;
  fake.closed.length = 0;
  fake.addImpl = null;
});

afterEach(async () => {
  await closeQueues();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("jobIdFrom", () => {
  it("is deterministic and never contains ':'", () => {
    const id = jobIdFrom("cooling-off", "user:1", 42);
    expect(id).toBe(jobIdFrom("cooling-off", "user:1", 42));
    expect(id).not.toContain(":");
    expect(id).toBe("cooling-off|user%3A1|42");
  });

  it("keeps distinct parts distinct", () => {
    const ids = [
      jobIdFrom("a|b", "c"),
      jobIdFrom("a", "b|c"),
      jobIdFrom("a:b"),
      jobIdFrom("a%3Ab"),
      jobIdFrom("a", "b"),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects no parts, empty parts and ids BullMQ would refuse as integers", () => {
    expect(() => jobIdFrom()).toThrow(RangeError);
    expect(() => jobIdFrom("a", "")).toThrow(RangeError);
    expect(() => jobIdFrom(123)).toThrow(RangeError);
    expect(jobIdFrom("order", 123)).toBe("order|123");
  });
});

describe("enqueueJob without REDIS_URL", () => {
  it("skips outside production and logs once per queue", async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await enqueueJob("skip-a", "job", {})).toEqual({ status: "skipped" });
    expect(await enqueueJob("skip-a", "job", {})).toEqual({ status: "skipped" });
    expect(await enqueueJob("skip-b", "job", {})).toEqual({ status: "skipped" });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(fake.constructed).toHaveLength(0);
  });

  it("throws QueueUnavailableError in production", async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = "production";
    const err = await enqueueJob("prod", "job", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueueUnavailableError);
    expect(err).toMatchObject({ statusCode: 503, code: "queue_unavailable", queueName: "prod" });
  });
});

describe("enqueueJob with REDIS_URL", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://127.0.0.1:63800";
  });

  it("reuses one Queue per name, with a url connection and 3 exponential attempts", async () => {
    const results = await Promise.all([
      enqueueJob("q1", "a", { n: 1 }, { jobId: "x-1" }),
      enqueueJob("q1", "b", { n: 2 }),
      enqueueJob("q2", "c", {}),
    ]);
    expect(results[0]).toEqual({ status: "queued", jobId: "x-1" });
    expect(fake.constructed.map((c) => c.name)).toEqual(["q1", "q2"]);
    expect(fake.constructed[0]!.opts).toMatchObject({
      connection: { url: "redis://127.0.0.1:63800", enableOfflineQueue: false },
      defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    });
    await closeQueues();
    expect(fake.closed.sort()).toEqual(["q1", "q2"]);
    await enqueueJob("q1", "a", {});
    expect(fake.constructed.map((c) => c.name)).toEqual(["q1", "q2", "q1"]);
  });

  it("passes jobId, a rounded non-negative delay and attempts through", async () => {
    await enqueueJob("q", "j", { a: 1 }, { jobId: "k", delay: 1500.4, attempts: 5 });
    await enqueueJob("q", "j", {}, { delay: -10 });
    expect(fake.adds[0]).toEqual({ queue: "q", name: "j", data: { a: 1 }, opts: { jobId: "k", delay: 1500, attempts: 5 } });
    expect(fake.adds[1]!.opts).toEqual({ delay: 0 });
  });

  it("rejects a jobId BullMQ would refuse before touching Redis", async () => {
    await expect(enqueueJob("q", "j", {}, { jobId: "a:b" })).rejects.toThrow(RangeError);
    await expect(enqueueJob("q", "j", {}, { jobId: "7" })).rejects.toThrow(RangeError);
    expect(fake.adds).toHaveLength(0);
  });

  it("throws QueueUnavailableError when add fails, in any environment", async () => {
    process.env.NODE_ENV = "test";
    fake.addImpl = async () => {
      throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
    };
    const err = await enqueueJob("q", "j", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueueUnavailableError);
    expect((err as Error).cause).toBeInstanceOf(Error);
    // The cached queue stays: ioredis reconnects on its own, and the next add succeeds.
    fake.addImpl = null;
    expect(await enqueueJob("q", "j", {}, { jobId: "after" })).toEqual({ status: "queued", jobId: "after" });
    expect(fake.constructed).toHaveLength(1);
  });

  it("throws QueueUnavailableError when add hangs past the timeout", async () => {
    // Open the queue first so the add (and its timer) starts within microtasks under fake timers.
    await enqueueJob("q", "warm", {});
    vi.useFakeTimers();
    fake.addImpl = () => new Promise(() => {});
    const pending = enqueueJob("q", "j", {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    const err = await pending;
    expect(err).toBeInstanceOf(QueueUnavailableError);
    expect(String((err as Error).cause)).toContain("timed out");
  });
});
