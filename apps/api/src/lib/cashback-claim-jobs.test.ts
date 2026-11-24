import { describe, expect, it, vi } from "vitest";
import { processCashbackClaimDeadline, type CashbackClaimDeadlinePayload } from "./cashback-claim-jobs.js";

describe("processCashbackClaimDeadline", () => {
  it("shows the claim's amount in its own currency, with its minor units", async () => {
    const recordPushEvent = vi.fn(async () => ({ id: "pe-1", status: "QUEUED" as const }));
    const repos = {
      findUserById: vi.fn(async () => ({
        id: "u1",
        prefs: {},
        timeZone: "Asia/Kolkata",
        pushToken: "ExponentPushToken[abc]",
      })),
      recordPushEvent,
      updatePushEventStatus: vi.fn(async () => undefined),
    };
    const payload: CashbackClaimDeadlinePayload = {
      claimId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      userId: "u1",
      source: "Card rewards",
      merchant: "Target",
      amountMinor: 1_250,
      currency: "USD",
      expiresAt: "2099-01-15T00:00:00.000Z",
    };
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    // Midday IST: outside default quiet hours.
    const result = await processCashbackClaimDeadline(payload, repos as never, {
      now: new Date("2099-01-12T06:30:00.000Z"),
      sendExpo,
    });
    expect(result.status).toBe("sent");
    const body = (recordPushEvent.mock.calls[0] as unknown as [{ body: string }])[0].body;
    expect(body).toBe("Card rewards · Target: $12.50 — claim before it lapses");
  });
});
