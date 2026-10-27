import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BullMQ drops a string `connection` (`new Queue(name, { connection: redisUrl })`) and connects to
 * 127.0.0.1:6379 instead of REDIS_URL. Producers go through enqueueJob, the API's consumers through
 * the runner; both must hand BullMQ `{ url }` (or an ioredis instance, as the services do).
 */

const fake = vi.hoisted(() => ({
  constructed: [] as Array<{ kind: "Queue" | "Worker"; name: string; opts: Record<string, unknown> }>,
}));

vi.mock("bullmq", () => {
  class Queue {
    constructor(
      readonly name: string,
      opts: Record<string, unknown>,
    ) {
      fake.constructed.push({ kind: "Queue", name, opts });
    }
    on() {
      return this;
    }
    async add(_name: string, _data: unknown, opts: Record<string, unknown>) {
      return { id: (opts.jobId as string) ?? "1" };
    }
    async getJobSchedulers() {
      return [];
    }
    async upsertJobScheduler() {}
    async removeJobScheduler() {}
    async close() {}
  }
  class Worker {
    constructor(name: string, _processor: unknown, opts: Record<string, unknown>) {
      fake.constructed.push({ kind: "Worker", name, opts });
    }
    on() {
      return this;
    }
    async close() {}
  }
  class DelayedError extends Error {}
  class UnrecoverableError extends Error {}
  return { Queue, Worker, DelayedError, UnrecoverableError };
});

const { closeQueues } = await import("../lib/queues/enqueue.js");
const { scheduleEmiDueNudge } = await import("../lib/emi-jobs.js");
const { scheduleLentOverdueNudge } = await import("../lib/borrow-lent-jobs.js");
const { schedulePriceDropNotify } = await import("../lib/price-drop.js");
const { scheduleCoolingOffRelease } = await import("../lib/cooling-off-jobs.js");
const { publishIngestJob } = await import("../lib/ingest-queue.js");
const { scheduleReturnDeadlineReminder } = await import("../lib/return-jobs.js");
const { scheduleMorningOutfit } = await import("../lib/wardrobe-jobs.js");
const { scheduleTailoringTransitions } = await import("../lib/tailoring-jobs.js");
const { startJobRunner } = await import("./runner.js");
const { JOB_HANDLERS, JOB_SCHEDULES } = await import("./registry.js");

const PRIVATE_REDIS = "redis://127.0.0.1:63807";
const env = { REDIS_URL: process.env.REDIS_URL, NODE_ENV: process.env.NODE_ENV };

beforeEach(() => {
  fake.constructed.length = 0;
  process.env.REDIS_URL = PRIVATE_REDIS;
  process.env.NODE_ENV = "development";
});

afterEach(async () => {
  await closeQueues();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function expectUrlConnections(kind: "Queue" | "Worker", count: number) {
  const built = fake.constructed.filter((c) => c.kind === kind);
  expect(built).toHaveLength(count);
  for (const { opts } of built) {
    expect(typeof opts.connection).toBe("object");
    expect(opts.connection).toMatchObject({ url: PRIVATE_REDIS });
  }
}

describe("BullMQ connections at runtime", () => {
  it("every producer builds its queue with { url: REDIS_URL }, never a string", async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await scheduleEmiDueNudge({
      id: "plan-1",
      userId: "u1",
      provider: "Bajaj",
      merchant: null,
      remainingMinor: 10_000,
      installmentMinor: 2_000,
      nextDueOn: future,
      currency: "INR",
      status: "ACTIVE",
    } as Parameters<typeof scheduleEmiDueNudge>[0]);
    await scheduleLentOverdueNudge({ userId: "u1", wardrobeItemId: "i1", lentTo: "Asha", dueOn: future });
    await schedulePriceDropNotify({
      userId: "u1",
      watchId: "w1",
      brand: "FabIndia",
      listingId: "l1",
      listingTitle: "Kurta",
      watchedPriceMinor: 200_000,
      currentPriceMinor: 150_000,
    });
    await scheduleCoolingOffRelease({
      userId: "u1",
      releaseAt: new Date(Date.now() + 86_400_000).toISOString(),
      category: "tops",
      cartFingerprint: "fp1",
    });
    await publishIngestJob({ kind: "SMS", documentId: "doc-1", userId: "u1" });
    await scheduleReturnDeadlineReminder({
      returnId: "r1",
      userId: "u1",
      windowDeadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      merchant: "Myntra",
    });
    await scheduleMorningOutfit("u1", { timeZone: "Asia/Kolkata" });
    await scheduleTailoringTransitions({ orderId: "o1", userId: "u1" });

    expectUrlConnections("Queue", 8);
  });

  it("the API worker builds every Queue and Worker with { url: REDIS_URL }", async () => {
    const runner = await startJobRunner({
      redisUrl: PRIVATE_REDIS,
      handlers: JOB_HANDLERS,
      schedules: JOB_SCHEDULES,
      deps: {} as never,
      recordDeadLetter: async () => {},
      alert: () => {},
    });
    await runner.close();

    expectUrlConnections("Queue", JOB_HANDLERS.length);
    expectUrlConnections("Worker", JOB_HANDLERS.length);
  });
});

// A `connection:` given a URL string, an env var or a template literal; `{ connection }` shorthand
// is checked through its declaration below.
const STRING_CONNECTION =
  /connection\s*:\s*(?:["'`]|process\.env|[\w.]*(?:url|Url|URL)\s*(?:[,}\n)]|\?\?|\|\|))/;
const STRING_CONNECTION_VAR =
  /(?:const|let)\s+connection\s*(?::\s*string\s*)?=\s*(?:["'`]|process\.env|[\w.]*(?:url|Url|URL)\s*[;,\n])/;
const CONSTRUCTS_BULLMQ = /new\s+(?:Queue|Worker|QueueEvents|FlowProducer)\s*[<(]/;
// The only places in the API that build BullMQ clients.
const API_BULLMQ_OWNERS = new Set(["lib/queues/enqueue.ts", "jobs/runner.ts"]);

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function stringConnections(source: string): string[] {
  return [STRING_CONNECTION, STRING_CONNECTION_VAR].flatMap((re) => source.match(re)?.[0] ?? []);
}

describe("BullMQ connections in source", () => {
  it("catches the string-connection forms", () => {
    expect(stringConnections("new Queue(EMI_QUEUE, { connection: redisUrl });")).not.toEqual([]);
    expect(stringConnections("new Queue(Q, { connection: process.env.REDIS_URL! })")).not.toEqual([]);
    expect(stringConnections("new Worker(Q, p, { connection: config.redisUrl,\n })")).not.toEqual([]);
    expect(stringConnections("const connection = redisUrl;\nnew Queue(Q, { connection })")).not.toEqual([]);
    expect(stringConnections("new Queue(Q, { connection: `redis://${host}` })")).not.toEqual([]);
    expect(stringConnections("connection: { url, enableOfflineQueue: false }")).toEqual([]);
    expect(stringConnections("const connection = { url: options.redisUrl };")).toEqual([]);
    expect(stringConnections("const connection = options.connection ?? new Redis(redisUrl)")).toEqual([]);
  });

  it("no API or service file hands BullMQ a string connection", () => {
    const dirs = [
      join(repoRoot, "apps/api/src"),
      join(repoRoot, "packages/shared/src"),
      ...readdirSync(join(repoRoot, "services")).map((s) => join(repoRoot, "services", s, "src")),
    ].filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
    const offenders = dirs
      .flatMap(sourceFiles)
      .flatMap((file) => stringConnections(readFileSync(file, "utf8")).map((m) => `${relative(repoRoot, file)}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("API code builds BullMQ clients only in enqueue.ts and the runner (producers use enqueueJob)", () => {
    const apiSrc = join(repoRoot, "apps/api/src");
    const builders = sourceFiles(apiSrc)
      .filter((file) => CONSTRUCTS_BULLMQ.test(readFileSync(file, "utf8")))
      .map((file) => relative(apiSrc, file))
      .filter((file) => !API_BULLMQ_OWNERS.has(file));
    expect(builders).toEqual([]);
  });
});
