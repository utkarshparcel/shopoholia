import { randomInt } from "node:crypto";
import { createDb, users } from "@worn/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

async function nullClears(repos: Repositories) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  await repos.updateUser(user.id, { pushToken: "ExponentPushToken[x]", displayName: "Asha" });
  const cleared = await repos.updateUser(user.id, { pushToken: null, displayName: null });
  expect(cleared.pushToken).toBeNull();
  expect(cleared.displayName).toBeNull();
}

async function pushEventsAlike(repos: Repositories) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  const record = (eventType: string) =>
    repos.recordPushEvent({
      userId: user.id,
      orderId: null,
      eventType,
      dedupeKey: `test:${eventType}:${randomInt(10 ** 9)}`,
      title: "t",
      body: "b",
      payload: {},
      status: "QUEUED",
    });
  const first = await record("ORDER_PACKED");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await record("ORDER_DELIVERED");
  await repos.updatePushEventStatus?.(first.id, "SENT", "ticket-1");
  const events = await repos.listPushEvents(user.id);
  // Newest first, and the Expo ticket is kept.
  expect(events.map((event) => event.eventType)).toEqual(["ORDER_DELIVERED", "ORDER_PACKED"]);
  expect(events[1]).toMatchObject({ status: "SENT", expoTicketId: "ticket-1" });
}

describe("updateUser (memory)", () => {
  it("clears a field given as null", async () => {
    await nullClears(createMemoryRepositories());
  });

  it("push events: listed and updated as in Postgres", async () => {
    await pushEventsAlike(createMemoryRepositories());
  });
});

describePostgres("updateUser (postgres)", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  it("clears a field given as null", async () => {
    await nullClears(repos);
  });

  it("push events: listed and updated as in memory", async () => {
    await pushEventsAlike(repos);
  });

  it("writes only the fields given, so it never undoes a concurrent streak claim", async () => {
    const db = createDb(databaseUrl!);
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    const claimedAt = new Date();
    let update: Promise<unknown> | undefined;
    await db.transaction(async (tx) => {
      // A streak claim holding the user's row lock...
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      // ...while an avatar upload's updateUser reads the row and then waits on the lock.
      update = repos.updateUser(user.id, { avatarStatus: "PROCESSING" });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tx.update(users).set({ streakCount: 1, lastStreakClaimAt: claimedAt }).where(eq(users.id, user.id));
    });
    await update;
    const after = await repos.findUserById(user.id);
    expect(after?.avatarStatus).toBe("PROCESSING");
    expect(after?.streakCount).toBe(1);
    expect(after?.lastStreakClaimAt?.getTime()).toBe(claimedAt.getTime());
  });
});
