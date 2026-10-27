import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CashbackClaim, CashbackClaimListResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({ id: "job-1" })),
  close: vi.fn(async () => undefined),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return queueMocks.add(...args);
    }
    close() {
      return queueMocks.close();
    }
  },
}));

describe("cashback-claims CRUD (U006)", () => {
  const prevRedis = process.env.REDIS_URL;

  beforeEach(() => {
    queueMocks.add.mockClear();
    queueMocks.close.mockClear();
    process.env.REDIS_URL = "redis://localhost:6379";
    // Deadlines below are fixed dates; reminders are only queued for future ones.
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (prevRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevRedis;
  });

  async function withConsent(
    app: Awaited<ReturnType<typeof buildTestServer>>["app"],
    token: string,
    userId: string,
  ) {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
  }

  it("creates, lists sorted by deadline, start-url, marks claimed", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await withConsent(app, accessToken, userId);

    const later = await app.inject({
      method: "POST",
      url: "/cashback-claims",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        source: "Axis Fashion",
        amountMinor: 10_000,
        expiresAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(later.statusCode).toBe(201);

    const sooner = await app.inject({
      method: "POST",
      url: "/cashback-claims",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        source: "HDFC Swiggy",
        merchant: "Myntra",
        amountMinor: 25_000,
        expiresAt: "2026-09-01T00:00:00.000Z",
        claimUrl: "https://rewards.example/claim",
        notes: "Fashion festival cashback",
      },
    });
    expect(sooner.statusCode).toBe(201);
    const claim = sooner.json() as CashbackClaim;
    expect(claim.status).toBe("UNCLAIMED");
    expect(claim.claimUrl).toBe("https://rewards.example/claim");
    expect(claim.notes).toBe("Fashion festival cashback");
    expect(queueMocks.add).toHaveBeenCalled();

    const unclaimed = await app.inject({
      method: "GET",
      url: "/cashback-claims?status=UNCLAIMED",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(unclaimed.statusCode).toBe(200);
    const list = (unclaimed.json() as CashbackClaimListResponse).claims;
    expect(list).toHaveLength(2);
    expect(list[0]!.source).toBe("HDFC Swiggy");
    expect(list[1]!.source).toBe("Axis Fashion");

    const start = await app.inject({
      method: "GET",
      url: `/cashback-claims/${claim.id}/start-url`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().startUrl).toBe("https://rewards.example/claim");

    const mark = await app.inject({
      method: "POST",
      url: `/cashback-claims/${claim.id}/claim`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(mark.statusCode).toBe(200);
    expect((mark.json() as CashbackClaim).status).toBe("CLAIMED");

    await app.close();
  });
});
