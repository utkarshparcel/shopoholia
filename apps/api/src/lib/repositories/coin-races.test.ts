import { randomInt, randomUUID } from "node:crypto";
import { AFFILIATE_CASHBACK_COINS, streakRewardForDay } from "@worn/shared";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Parallel taps on coin earns and spends. The same cases run on memory (always) and Postgres
// (with DATABASE_URL).
describe("memory coin races", () => {
  const repos = createMemoryRepositories();
  coinRaceCases(() => repos);
});

describePostgres("Postgres coin races", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  coinRaceCases(() => repos);
});

async function newUser(repos: Repositories) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  return user;
}

function coinRaceCases(getRepos: () => Repositories) {
  it("streak: parallel claims pay one day once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const before = await repos.getCoinBalance(user.id);
    const results = await Promise.all([1, 2, 3, 4].map(() => repos.claimStreak(user.id)));
    expect(results.map((r) => r.coinsGranted).sort((a, b) => b - a)).toEqual([
      streakRewardForDay(1),
      0,
      0,
      0,
    ]);
    expect(await repos.getCoinBalance(user.id)).toBe(before + streakRewardForDay(1));
    expect(await repos.getStreakStatus(user.id)).toMatchObject({
      streakCount: 1,
      todayClaimed: true,
      nextStreakDay: 2,
    });
  });

  it("cashback: parallel confirms of one click pay once", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    await repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    const before = await repos.getCoinBalance(user.id);

    await Promise.all([1, 2, 3, 4].map(() => repos.confirmCashback(clickId, "CONFIRMED")));

    expect(await repos.getCoinBalance(user.id)).toBe(before + AFFILIATE_CASHBACK_COINS);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([
      { status: "CONFIRMED", coinsEarned: AFFILIATE_CASHBACK_COINS },
    ]);
  });

  it("cashback: a repeated click keeps a confirmed event, so it can't pay again", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    const click = () => repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    await click();
    const before = await repos.getCoinBalance(user.id);
    await repos.confirmCashback(clickId, "CONFIRMED");

    await click();
    await repos.confirmCashback(clickId, "CONFIRMED");

    expect(await repos.getCoinBalance(user.id)).toBe(before + AFFILIATE_CASHBACK_COINS);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([{ status: "CONFIRMED" }]);
  });

  it("cashback: a rejected click stays rejected and unpaid", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const clickId = `test:${randomUUID()}`;
    await repos.recordCashbackEvent({ userId: user.id, listingId: null, platform: "amazon", clickId });
    const before = await repos.getCoinBalance(user.id);
    await Promise.all([
      repos.confirmCashback(clickId, "REJECTED"),
      repos.confirmCashback(clickId, "REJECTED"),
    ]);
    await repos.confirmCashback(clickId, "CONFIRMED");
    await repos.confirmCashback(`test:${randomUUID()}`, "CONFIRMED");
    expect(await repos.getCoinBalance(user.id)).toBe(before);
    expect(await repos.listCashbackEvents(user.id)).toMatchObject([{ status: "REJECTED", coinsEarned: 0 }]);
  });
}
