import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  INTERVIEW_KIT_QUEUE,
  interviewKitReminderJobId,
  scheduleInterviewKitReminder,
} from "./interview-kit.js";
import { closeQueues } from "./queues/enqueue.js";

// Live Redis: set TEST_REDIS_URL (e.g. redis://127.0.0.1:63800) to run. Skipped otherwise.
// The reminder must land on the Redis that REDIS_URL names, not BullMQ's 127.0.0.1:6379 default.
const redisUrl = process.env.TEST_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("interview-kit reminder on a real Redis", () => {
  const previous = process.env.REDIS_URL;

  afterAll(async () => {
    await closeQueues();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });

  it("queues one delayed job on REDIS_URL per kit and remindAt", async () => {
    process.env.REDIS_URL = redisUrl;
    const kitId = randomUUID();
    const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const input = {
      userId: randomUUID(),
      kitId,
      name: "Panel",
      kind: "interview" as const,
      eventAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      remindAt,
      occasion: "FORMAL" as const,
    };
    expect(await scheduleInterviewKitReminder(input)).toBe("published");
    expect(await scheduleInterviewKitReminder(input)).toBe("published");

    const { Queue } = await import("bullmq");
    const q = new Queue(INTERVIEW_KIT_QUEUE, { connection: { url: redisUrl } });
    try {
      const jobId = interviewKitReminderJobId(input.userId, kitId, remindAt);
      const job = await q.getJob(jobId);
      expect(job?.data).toEqual(input);
      expect(await job?.getState()).toBe("delayed");
      const delayed = await q.getJobs(["delayed"]);
      expect(delayed.filter((j) => (j.data as { kitId?: string }).kitId === kitId)).toHaveLength(1);
      await job?.remove();
    } finally {
      await q.close();
    }
  });
});
