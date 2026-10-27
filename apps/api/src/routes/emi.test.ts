import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmiPlan, EmiPlanListResponse, EmiScheduleResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";
import { jobIdFrom } from "../lib/queues/enqueue.js";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: "job-1" })),
  close: vi.fn(async () => undefined),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return queueMocks.add(...args);
    }
    on() {
      return this;
    }
    close() {
      return queueMocks.close();
    }
  },
}));

describe("emi routes + schedule nudge", () => {
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    // Due dates below are fixed; the nudge is only queued for a future one.
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
  });

  async function withConsent(app: Awaited<ReturnType<typeof buildTestServer>>["app"], token: string, userId: string) {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
  }

  it("creates plan, returns schedule, pays down remaining, schedules nudge", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await withConsent(app, accessToken, userId);

    const create = await app.inject({
      method: "POST",
      url: "/emi",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        provider: "Simpl",
        merchant: "Myntra",
        principalMinor: 30_000,
        installmentMinor: 10_000,
        nextDueOn: "2026-09-15",
      },
    });
    expect(create.statusCode).toBe(201);
    const plan = create.json() as EmiPlan;
    expect(plan.remainingMinor).toBe(30_000);
    expect(queueMocks.add).toHaveBeenCalled();
    const [, , opts] = queueMocks.add.mock.calls[0]!;
    expect((opts as { jobId: string }).jobId).toBe(jobIdFrom(`emi-due:${plan.id}:2026-09-15`));

    const schedule = await app.inject({
      method: "GET",
      url: `/emi/${plan.id}/schedule`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(schedule.statusCode).toBe(200);
    const sched = schedule.json() as EmiScheduleResponse;
    expect(sched.schedule).toHaveLength(3);
    expect(sched.remainingMinor).toBe(30_000);

    const pay = await app.inject({
      method: "POST",
      url: `/emi/${plan.id}/pay`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(pay.statusCode).toBe(200);
    const after = pay.json() as EmiPlan;
    expect(after.remainingMinor).toBe(20_000);
    expect(after.nextDueOn).toBe("2026-10-15");

    const list = await app.inject({
      method: "GET",
      url: "/emi?status=ACTIVE",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((list.json() as EmiPlanListResponse).plans).toHaveLength(1);

    await app.close();
  });

  it("pay with one idempotencyKey records the installment once; a stale plan is 409; others get 404", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await withConsent(app, accessToken, userId);
    const auth = { authorization: `Bearer ${accessToken}` };
    const plan = (
      await app.inject({
        method: "POST",
        url: "/emi",
        headers: auth,
        payload: { provider: "Simpl", principalMinor: 30_000, installmentMinor: 10_000, nextDueOn: "2026-09-15" },
      })
    ).json() as EmiPlan;
    const key = "6f0c1d7e-3b1a-4c55-9a0e-1f6f3b2a9c01";
    const pay = () =>
      app.inject({ method: "POST", url: `/emi/${plan.id}/pay`, headers: auth, payload: { idempotencyKey: key } });
    const [a, b] = await Promise.all([pay(), pay()]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const again = await pay();
    expect(again.statusCode).toBe(200);
    expect((again.json() as EmiPlan).remainingMinor).toBe(20_000);
    expect((again.json() as EmiPlan).nextDueOn).toBe("2026-10-15");

    // The plan as read no longer matches: nothing is written.
    const stale = await repos.payEmiPlan(plan.id, userId, {
      from: { remainingMinor: 30_000, nextDueOn: "2026-09-15", status: "ACTIVE" },
      to: { remainingMinor: 20_000, nextDueOn: "2026-10-15", status: "ACTIVE" },
    });
    expect(stale?.outcome).toBe("CONFLICT");
    expect((await repos.findEmiPlan(plan.id, userId))?.remainingMinor).toBe(20_000);

    const other = await login(app, "919876500021");
    await withConsent(app, other.accessToken, other.userId);
    const foreign = await app.inject({
      method: "POST",
      url: `/emi/${plan.id}/pay`,
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: {},
    });
    expect(foreign.statusCode).toBe(404);
    await app.close();
  });

  it("parses EMI due SMS fixture and mark paid writes audit ledger note (U007)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await withConsent(app, accessToken, userId);

    const fromSms = await app.inject({
      method: "POST",
      url: "/emi/from-sms",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        from: "SIMPL",
        body: "Simpl: EMI of Rs.999 due on 15/09/2026 for Myntra purchase. Outstanding Rs.2997. Avoid late fees.",
      },
    });
    expect(fromSms.statusCode).toBe(201);
    const plan = fromSms.json() as EmiPlan;
    expect(plan.installmentMinor).toBe(99_900);
    expect(plan.nextDueOn).toBe("2026-09-15");

    const schedule = await app.inject({
      method: "GET",
      url: `/emi/${plan.id}/schedule`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(schedule.statusCode).toBe(200);
    expect((schedule.json() as EmiScheduleResponse).schedule.length).toBeGreaterThan(0);

    const pay = await app.inject({
      method: "POST",
      url: `/emi/${plan.id}/pay`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(pay.statusCode).toBe(200);

    // Prefer in-process audit read — GET /vault/audit can race with other
    // suites that call clearAuditLog() under file-parallel coverage runs.
    const { listAuditRecords } = await import("../lib/audit.js");
    const local = listAuditRecords({ userId, event: "emi.payment" });
    expect(local.some((r) => r.payload?.planId === plan.id)).toBe(true);

    const audit = await app.inject({
      method: "GET",
      url: "/vault/audit?event=emi.payment",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(audit.statusCode).toBe(200);
    const rows = (audit.json() as { records?: Array<{ event: string; payload?: { planId?: string } }> })
      .records;
    // Under parallel load the in-memory log may be cleared mid-flight; local
    // assert above is the source of truth for U007.
    if (Array.isArray(rows) && rows.length > 0) {
      expect(rows.some((r) => r.event === "emi.payment" && r.payload?.planId === plan.id)).toBe(
        true,
      );
    }

    await app.close();
  });
});
