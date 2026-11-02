import { afterEach, describe, expect, it, vi } from "vitest";
import { streakRewardForDay, type StreakClaimResponse, type StreakResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

/** Moves the clock to `iso` and signs in again, since access tokens expire across day jumps. */
async function at(app: App, iso: string) {
  vi.setSystemTime(new Date(iso));
  return login(app);
}

function claim(app: App, accessToken: string) {
  return app.inject({
    method: "POST",
    url: "/streaks/claim",
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

async function status(app: App, accessToken: string) {
  const res = await app.inject({
    method: "GET",
    url: "/streaks/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as StreakResponse;
}

describe("daily streak", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pays parallel claims once", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const before = await app.deps.repos.getCoinBalance(userId);

    const results = await Promise.all([1, 2, 3, 4].map(() => claim(app, accessToken)));

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400, 400, 400]);
    expect(await app.deps.repos.getCoinBalance(userId)).toBe(before + streakRewardForDay(1));
    const { transactions } = await app.deps.repos.listCoinTransactions({ userId, limit: 50 });
    expect(transactions.filter((t) => t.type === "EARN_STREAK")).toHaveLength(1);
    await app.close();
  });

  it("counts days in the user's time zone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app } = await buildTestServer();
    let session = await at(app, "2026-10-10T06:30:00Z"); // Oct 9, 23:30 in Los Angeles
    await app.deps.repos.setUserTimeZone(session.userId, "America/Los_Angeles");

    expect((await claim(app, session.accessToken)).statusCode).toBe(200);

    // Same UTC day, but a new day in Los Angeles: the streak continues.
    session = await at(app, "2026-10-10T08:00:00Z"); // Oct 10, 01:00 in Los Angeles
    const second = await claim(app, session.accessToken);
    expect(second.statusCode).toBe(200);
    expect((second.json() as StreakClaimResponse).currentStreak).toBe(2);

    // A new UTC day, but still Oct 10 in Los Angeles: already claimed.
    session = await at(app, "2026-10-11T03:00:00Z"); // Oct 10, 20:00 in Los Angeles
    expect((await claim(app, session.accessToken)).statusCode).toBe(400);
    await app.close();
  });

  it("offers day 1 once the streak is broken, matching what a claim pays", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app } = await buildTestServer();
    let session = await at(app, "2026-10-10T06:00:00Z");
    await app.deps.repos.setUserTimeZone(session.userId, "UTC");
    expect((await claim(app, session.accessToken)).statusCode).toBe(200);
    session = await at(app, "2026-10-11T06:00:00Z");
    expect((await claim(app, session.accessToken)).statusCode).toBe(200);

    // Claimed today: tomorrow continues the streak.
    expect(await status(app, session.accessToken)).toMatchObject({
      todayClaimed: true,
      nextRewardDay: 3,
      nextRewardCoins: streakRewardForDay(3),
    });

    // Yesterday was claimed: today continues it.
    session = await at(app, "2026-10-12T06:00:00Z");
    expect(await status(app, session.accessToken)).toMatchObject({
      todayClaimed: false,
      nextRewardDay: 3,
    });

    // Two days missed: the next claim starts over.
    session = await at(app, "2026-10-14T06:00:00Z");
    const broken = await status(app, session.accessToken);
    expect(broken).toMatchObject({
      todayClaimed: false,
      nextRewardDay: 1,
      nextRewardCoins: streakRewardForDay(1),
    });
    const paid = (await claim(app, session.accessToken)).json() as StreakClaimResponse;
    expect(paid).toMatchObject({ currentStreak: 1, coinsGranted: broken.nextRewardCoins });
    await app.close();
  });
});
