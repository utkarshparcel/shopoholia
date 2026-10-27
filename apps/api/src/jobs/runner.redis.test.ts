import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { deferJob, type DeadLetter } from "@worn/shared";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineJob, startJobRunner, syncJobSchedules, type JobRunner } from "./runner.js";

// Live Redis: set TEST_REDIS_URL (e.g. redis://127.0.0.1:63807) to run. Skipped otherwise.
const redisUrl = process.env.TEST_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describeRedis("job runner on a real Redis", () => {
  const prefix = `runner-test-${randomUUID()}`;
  const opened: Queue[] = [];
  const runners: JobRunner[] = [];

  function queue(name: string) {
    const q = new Queue(name, { connection: { url: redisUrl } });
    opened.push(q);
    return q;
  }

  afterAll(async () => {
    await Promise.all(runners.map((runner) => runner.close()));
    for (const q of opened) {
      await q.obliterate({ force: true });
      await q.close();
    }
  });

  async function start(name: string, handle: (data: { n: number }) => Promise<void>) {
    const deadLetters: DeadLetter[] = [];
    const alert = vi.fn();
    const runner = await startJobRunner({
      redisUrl: redisUrl!,
      handlers: [defineJob({ queue: name, schema: z.object({ n: z.number() }), handle })],
      schedules: [],
      deps: {},
      recordDeadLetter: async (entry) => {
        deadLetters.push(entry);
      },
      alert,
    });
    runners.push(runner);
    return { deadLetters, alert };
  }

  it("runs a job once, and a re-added job id is not run again", async () => {
    const name = `${prefix}-once`;
    const handle = vi.fn(async () => undefined);
    await start(name, handle);
    const q = queue(name);
    await q.add("job", { n: 1 }, { jobId: "once|1" });
    await waitFor(async () => (await q.getJob("once|1"))?.finishedOn !== undefined);
    await q.add("job", { n: 2 }, { jobId: "once|1" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(handle).toHaveBeenCalledTimes(1);
    expect(await (await q.getJob("once|1"))?.getState()).toBe("completed");
  });

  it("retries a failing job, then dead-letters it once with ids only", async () => {
    const name = `${prefix}-fail`;
    const handle = vi.fn(async () => {
      throw new Error("boom");
    });
    const { deadLetters, alert } = await start(name, handle);
    const q = queue(name);
    await q.add(
      "job",
      { n: 1, title: "free text" },
      { jobId: "fail|1", attempts: 3, backoff: { type: "fixed", delay: 20 } },
    );
    await waitFor(() => deadLetters.length > 0);
    expect(handle).toHaveBeenCalledTimes(3);
    expect(deadLetters).toEqual([
      expect.objectContaining({
        queue: name,
        jobId: "fail|1",
        jobName: "job",
        data: { n: 1 },
        error: "Error: boom",
        attemptsMade: 3,
      }),
    ]);
    expect(alert).toHaveBeenCalledWith(
      "job failed for good",
      expect.objectContaining({ jobId: "fail|1" }),
      expect.any(Error),
    );
    expect(await (await q.getJob("fail|1"))?.getState()).toBe("failed");
  });

  it("dead-letters an invalid payload at once, without running the handler", async () => {
    const name = `${prefix}-invalid`;
    const handle = vi.fn(async () => undefined);
    const { deadLetters } = await start(name, handle);
    const q = queue(name);
    await q.add("job", { n: "not a number" }, { jobId: "invalid|1", attempts: 3 });
    await waitFor(() => deadLetters.length > 0);
    expect(handle).not.toHaveBeenCalled();
    expect(deadLetters[0]).toMatchObject({ attemptsMade: 1, error: expect.stringContaining("UnrecoverableError") });
  });

  it("a deferred job runs again later without spending an attempt", async () => {
    const name = `${prefix}-defer`;
    let runs = 0;
    const { deadLetters } = await start(name, async () => {
      runs += 1;
      if (runs === 1) deferJob(200);
    });
    const q = queue(name);
    await q.add("job", { n: 1 }, { jobId: "defer|1", attempts: 1 });
    await waitFor(async () => (await (await q.getJob("defer|1"))?.getState()) === "completed");
    expect(runs).toBe(2);
    expect(deadLetters).toEqual([]);
    expect((await q.getJob("defer|1"))?.attemptsMade).toBe(1);
  });

  it("dead-letters a job BullMQ fails for stalling too often (the processor never runs)", async () => {
    const name = `${prefix}-stalled`;
    const handle = vi.fn(async () => undefined);
    const { deadLetters, alert } = await start(name, handle);
    const q = queue(name);
    await q.add("job", { n: 1 }, { jobId: "stalled|1", delay: 300 });
    // What moveStalledJobsToWait writes when a job passes maxStalledCount.
    const client = await q.client;
    await client.hset(`${q.qualifiedName}:stalled|1`, "defa", "job stalled more than allowable limit");
    await waitFor(() => deadLetters.length > 0);
    expect(handle).not.toHaveBeenCalled();
    expect(deadLetters[0]).toMatchObject({
      queue: name,
      jobId: "stalled|1",
      data: { n: 1 },
      error: "UnrecoverableError: job stalled more than allowable limit",
    });
    expect(alert).toHaveBeenCalledWith("job failed for good", expect.objectContaining({ jobId: "stalled|1" }), expect.any(Error));
  });

  it("refuses to start with a schedule whose queue has no handler", async () => {
    await expect(
      startJobRunner({
        redisUrl: redisUrl!,
        handlers: [],
        schedules: [{ id: "s", queue: `${prefix}-none`, jobName: "x", pattern: "0 3 * * *", tz: "Asia/Kolkata" }],
        deps: {},
        recordDeadLetter: async () => undefined,
        alert: () => undefined,
      }),
    ).rejects.toThrow(/no handler/);
  });

  it("upserts schedules and removes the ones no longer listed", async () => {
    const name = `${prefix}-sched`;
    const q = queue(name);
    await q.upsertJobScheduler("old", { pattern: "0 1 * * *", tz: "Asia/Kolkata" }, { name: "old" });
    const schedule = { id: "daily", queue: name, jobName: "sweep", pattern: "0 3 * * *", tz: "Asia/Kolkata" };
    const first = await syncJobSchedules(new Map([[name, q]]), [schedule]);
    expect(first).toEqual({ upserted: [`${name}/daily`], removed: [`${name}/old`] });
    // Booting again changes nothing.
    const second = await syncJobSchedules(new Map([[name, q]]), [schedule]);
    expect(second.removed).toEqual([]);
    const schedulers = await q.getJobSchedulers(0, -1);
    expect(schedulers.map((s) => ({ key: s.key, pattern: s.pattern, tz: s.tz }))).toEqual([
      { key: "daily", pattern: "0 3 * * *", tz: "Asia/Kolkata" },
    ]);
    // One delayed run is waiting for the next 03:00 IST.
    const delayed = await q.getDelayed();
    expect(delayed.map((job) => job.name)).toEqual(["sweep"]);
  });
});
