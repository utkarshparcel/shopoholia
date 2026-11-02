import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const STATE_ETA = { PROCESSING: "2026-09-29T10:00:00.000Z", DELIVERED: "2026-09-29T12:00:00.000Z" };

describePostgres("postgres recordRevealRating", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  async function order() {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    const created = await repos.createOrder({
      userId: user.id,
      tier: "STANDARD",
      coinTotal: 0,
      stateEta: STATE_ETA,
      items: [],
    });
    return { user, order: created.order };
  }

  it("stores the rating in its own column and leaves stateEta as it was", async () => {
    const { user, order: o } = await order();
    expect(o.revealRating).toBeNull();

    await repos.recordRevealRating({ orderId: o.id, userId: user.id, rating: "loved" });

    expect(await repos.findOrderById(o.id)).toMatchObject({
      revealRating: "loved",
      stateEta: STATE_ETA,
    });
  });

  it("does not rate another user's order", async () => {
    const { order: o } = await order();
    const { user: other } = await order();

    await repos.recordRevealRating({ orderId: o.id, userId: other.id, rating: "meh" });

    expect((await repos.findOrderById(o.id))!.revealRating).toBeNull();
  });
});
