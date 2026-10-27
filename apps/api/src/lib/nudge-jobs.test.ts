import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FREQUENCY_CAPS,
  FOUND_MONEY_WAITING_EVENT,
  WEEKLY_DIGEST_EVENT,
  foundMoneyWaitingJobId,
  utcIsoWeekKey,
  weeklyDigestJobId,
} from "@worn/shared";
import {
  processFoundMoneyWaiting,
  processWeeklyDigest,
  type NudgeRepos,
} from "./nudge-jobs.js";

const NOON = new Date("2026-08-26T12:00:00.000Z");

function mockRepos(opts: {
  consentFlags?: Record<string, unknown>;
  pushToken?: string | null;
  recentCount?: number;
} = {}): NudgeRepos & {
  recorded: Array<Record<string, unknown>>;
} {
  const recorded: Array<Record<string, unknown>> = [];
  return {
    recorded,
    async findUserById() {
      return {
        consentFlags: opts.consentFlags ?? {},
        pushToken: opts.pushToken ?? null,
      };
    },
    async recordPushEvent(input) {
      recorded.push(input);
      return { id: `evt-${recorded.length}` };
    },
    async updatePushEventStatus() {},
    async countRecentPushEvents() {
      return opts.recentCount ?? 0;
    },
  };
}

describe("nudge-jobs (NOTIF-REENGAGE)", () => {
  it("stable jobIds use ISO week key", () => {
    const week = utcIsoWeekKey(NOON);
    expect(foundMoneyWaitingJobId("u1", week)).toBe(`found-money:u1:${week}`);
    expect(weeklyDigestJobId("u1", week)).toBe(`digest:u1:${week}`);
  });

  it("processFoundMoneyWaiting queues with amount + credits channel", async () => {
    const repos = mockRepos();
    const result = await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 240_000, accountCount: 2, currency: "INR" },
      repos,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(repos.recorded).toHaveLength(1);
    expect(repos.recorded[0]).toMatchObject({
      eventType: FOUND_MONEY_WAITING_EVENT,
      payload: expect.objectContaining({
        deepLink: "worn://vault?focus=found-money",
        androidChannelId: "worn-credits",
        amountMinor: 240_000,
      }),
    });
  });

  it("caps found-money when recent credits pushes hit frequency cap", async () => {
    const repos = mockRepos({ recentCount: DEFAULT_FREQUENCY_CAPS.credits });
    const result = await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 10_000, accountCount: 1 },
      repos,
      { now: NOON },
    );
    expect(result).toEqual({ status: "skipped" });
    expect(repos.recorded).toHaveLength(0);
  });

  it("processWeeklyDigest respects digest cap of 1/week", async () => {
    const repos = mockRepos({ recentCount: 1 });
    const result = await processWeeklyDigest(
      { userId: "u1", spendMinor: 50_000, avgCostPerWearMinor: 800 },
      repos,
      { now: NOON },
    );
    expect(result).toEqual({ status: "skipped" });
  });

  it("processWeeklyDigest delivers under cap with digest channel", async () => {
    const repos = mockRepos({ recentCount: 0 });
    const result = await processWeeklyDigest(
      {
        userId: "u1",
        spendMinor: 12_000,
        stillHaveMinor: 240_000,
        avgCostPerWearMinor: 400,
      },
      repos,
      { now: NOON },
    );
    expect(result.status).toBe("queued");
    expect(repos.recorded[0]).toMatchObject({
      eventType: WEEKLY_DIGEST_EVENT,
      payload: expect.objectContaining({
        deepLink: "worn://vault?focus=found-money",
        androidChannelId: "worn-digest",
        stillHaveMinor: 240_000,
      }),
    });
    expect(String(repos.recorded[0]!.title)).toMatch(/still have/i);
  });

  it("delays inside quiet hours", async () => {
    const repos = mockRepos();
    const result = await processWeeklyDigest(
      { userId: "u1", spendMinor: 1000 },
      repos,
      { now: new Date("2026-08-26T23:00:00.000Z") },
    );
    expect(result.status).toBe("delayed");
  });

  it("marks SENT when Expo succeeds", async () => {
    const repos = mockRepos({ pushToken: "ExponentPushToken[n]" });
    const sendExpo = vi.fn(async () => ({
      ok: true as const,
      ticketId: "ticket-n",
    }));
    const result = await processFoundMoneyWaiting(
      { userId: "u1", totalMinor: 5000, accountCount: 1 },
      repos,
      { now: NOON, sendExpo },
    );
    expect(result).toEqual({ status: "sent" });
    expect(sendExpo).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "worn-credits",
      }),
    );
  });
});
