import { describe, expect, it } from "vitest";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("createPostgresRepositories", () => {
  it("creates and finds users", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now()}`.slice(0, 12);
    const { user, isNew } = await repos.createUser(phone);
    expect(isNew).toBe(true);
    expect(await repos.findUserByPhone(phone)).toEqual(user);
    expect(await repos.findUserById(user.id)).toEqual(user);
  });

  it("manages coin ledger", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now() + 1}`.slice(0, 12);
    const { user } = await repos.createUser(phone);

    const grant = await repos.grantCoins({
      userId: user.id,
      delta: 100,
      type: "GRANT",
    });
    expect(grant.balanceAfter).toBe(100);
    expect(await repos.getCoinBalance(user.id)).toBe(100);

    await repos.spendCoins({
      userId: user.id,
      delta: 40,
      type: "SPEND_ORDER",
    });
    expect(await repos.getCoinBalance(user.id)).toBe(60);
  });

  it("manages carts and orders", async () => {
    const repos = createPostgresRepositoriesFromUrl(databaseUrl!);
    const phone = `9${Date.now() + 2}`.slice(0, 12);
    const { user } = await repos.createUser(phone);

    const cart = await repos.getOrCreateCart(user.id);
    expect(cart.userId).toBe(user.id);

    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "EXPRESS",
      coinTotal: 10,
      stateEta: { PROCESSING: new Date().toISOString() },
      items: [],
    });
    expect(order.state).toBe("PROCESSING");
    expect(await repos.findOrderById(order.id)).toBeTruthy();
  });
});
