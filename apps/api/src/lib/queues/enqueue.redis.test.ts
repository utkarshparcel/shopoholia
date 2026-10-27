import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeQueues, enqueueJob, jobIdFrom } from "./enqueue.js";

// Live Redis: set TEST_REDIS_URL (e.g. redis://127.0.0.1:63800) to run. Skipped otherwise.
const redisUrl = process.env.TEST_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("enqueueJob on a real Redis", () => {
  const previous = process.env.REDIS_URL;
  const queueName = `prelude-test-${randomUUID()}`;

  afterAll(async () => {
    const { Queue } = await import("bullmq");
    const q = new Queue(queueName, { connection: { url: redisUrl } }) as unknown as {
      obliterate(opts: { force: boolean }): Promise<void>;
      close(): Promise<void>;
    };
    await q.obliterate({ force: true });
    await q.close();
    await closeQueues();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });

  async function getJob(id: string) {
    const { Queue } = await import("bullmq");
    const q = new Queue(queueName, { connection: { url: redisUrl } }) as unknown as {
      getJob(id: string): Promise<{ id: string; data: unknown; opts: Record<string, unknown>; getState(): Promise<string> } | undefined>;
      close(): Promise<void>;
    };
    try {
      const job = await q.getJob(id);
      return job ? { id: job.id, data: job.data, opts: job.opts, state: await job.getState() } : null;
    } finally {
      await q.close();
    }
  }

  it("adds a delayed job with the default retry policy, once per jobId", async () => {
    process.env.REDIS_URL = redisUrl;
    const jobId = jobIdFrom("reminder", randomUUID(), "2026-10-26");
    const [a, b] = await Promise.all([
      enqueueJob(queueName, "remind", { n: 1 }, { jobId, delay: 60_000 }),
      enqueueJob(queueName, "remind", { n: 2 }, { jobId, delay: 60_000 }),
    ]);
    expect(a).toEqual({ status: "queued", jobId });
    expect(b).toEqual({ status: "queued", jobId });

    const job = await getJob(jobId);
    expect(job?.state).toBe("delayed");
    expect([{ n: 1 }, { n: 2 }]).toContainEqual(job?.data);
    expect(job?.opts).toMatchObject({ attempts: 3, backoff: { type: "exponential", delay: 1000 } });
  });

  it("gives each job without a jobId its own id, and honours attempts", async () => {
    process.env.REDIS_URL = redisUrl;
    const a = await enqueueJob(queueName, "plain", {}, { attempts: 1 });
    const b = await enqueueJob(queueName, "plain", {});
    expect(a.status).toBe("queued");
    expect(b.status).toBe("queued");
    if (a.status !== "queued" || b.status !== "queued") return;
    expect(a.jobId).not.toBe(b.jobId);
    expect((await getJob(a.jobId))?.opts).toMatchObject({ attempts: 1 });
  });
});
