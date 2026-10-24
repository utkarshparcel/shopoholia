import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createExpoPushService } from "../push/expo.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { RecordPushEventInput } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("Postgres push repositories", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  async function newUser() {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user;
  }

  function deviceToken() {
    return `ExponentPushToken[${randomUUID().replaceAll("-", "").slice(0, 22)}]`;
  }

  function eventInput(userId: string): RecordPushEventInput {
    return {
      userId,
      orderId: null,
      eventType: "ORDER_PACKED",
      dedupeKey: `test:${randomUUID()}`,
      title: "Packed with care",
      body: "Your pieces are boxed and waiting to ship.",
      payload: { deepLink: "worn://order/x", screen: "order", orderId: "x" },
      status: "QUEUED",
    };
  }

  it("records a push event once and says which call created it", async () => {
    const user = await newUser();
    const input = eventInput(user.id);

    const [a, b] = await Promise.all([
      repos.recordPushEventIfNew(input),
      repos.recordPushEventIfNew(input),
    ]);

    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(b.event.id).toBe(a.event.id);
    expect(a.event).toMatchObject({ status: "QUEUED", expoTicketId: null });
    expect((await repos.recordPushEvent(input)).id).toBe(a.event.id);
    expect(await repos.listPushEvents(user.id)).toHaveLength(1);
  });

  it("marks a push event sent with its Expo ticket, or failed", async () => {
    const user = await newUser();
    const { event: sent } = await repos.recordPushEventIfNew(eventInput(user.id));
    const { event: failed } = await repos.recordPushEventIfNew(eventInput(user.id));

    expect(
      await repos.updatePushEvent(sent.id, { status: "SENT", expoTicketId: "ticket-1" }),
    ).toMatchObject({ id: sent.id, status: "SENT", expoTicketId: "ticket-1" });
    expect(await repos.updatePushEvent(failed.id, { status: "FAILED" })).toMatchObject({
      status: "FAILED",
      expoTicketId: null,
    });
    expect(await repos.updatePushEvent(randomUUID(), { status: "SENT" })).toBeNull();

    const events = await repos.listPushEvents(user.id);
    expect(events.find((e) => e.id === sent.id)?.expoTicketId).toBe("ticket-1");
  });

  it("saves a push token and moves it to the account that registered it last", async () => {
    const first = await newUser();
    const second = await newUser();
    const token = deviceToken();

    expect((await repos.setPushToken(first.id, token))?.pushToken).toBe(token);
    expect((await repos.setPushToken(second.id, token))?.pushToken).toBe(token);

    expect((await repos.findUserById(first.id))?.pushToken).toBeNull();
    expect((await repos.findUserById(second.id))?.pushToken).toBe(token);
  });

  it("leaves the token with its owner when the registering user doesn't exist", async () => {
    const owner = await newUser();
    const token = deviceToken();
    await repos.setPushToken(owner.id, token);

    expect(await repos.setPushToken(randomUUID(), token)).toBeNull();
    expect((await repos.findUserById(owner.id))?.pushToken).toBe(token);
  });

  it("clears a push token, optionally only while it is still the saved one", async () => {
    const user = await newUser();
    const token = deviceToken();
    await repos.setPushToken(user.id, token);

    await repos.clearPushToken(user.id, deviceToken());
    expect((await repos.findUserById(user.id))?.pushToken).toBe(token);

    await repos.clearPushToken(user.id, token);
    expect((await repos.findUserById(user.id))?.pushToken).toBeNull();

    await repos.setPushToken(user.id, token);
    await repos.clearPushToken(user.id);
    expect((await repos.findUserById(user.id))?.pushToken).toBeNull();
  });

  it("sends a repeated order step once and drops a token Expo no longer knows", async () => {
    const user = await newUser();
    const token = deviceToken();
    await repos.setPushToken(user.id, token);
    const { order } = await repos.createOrder({
      userId: user.id,
      tier: "EXPRESS",
      coinTotal: 0,
      stateEta: {},
      items: [],
    });
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const push = createExpoPushService({ repos, fetch: fetchMock });
    const step = {
      userId: user.id,
      orderId: order.id,
      eventType: "ORDER_OUT_FOR_DELIVERY",
      title: "Out for delivery",
      body: "Your haul is on the move.",
    };

    await Promise.all([push.send(step), push.send(step)]);
    warn.mockRestore();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const events = await repos.listPushEvents(user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: order.id,
      status: "FAILED",
      payload: { deepLink: `worn://order/${order.id}`, screen: "order", orderId: order.id },
    });
    expect((await repos.findUserById(user.id))?.pushToken).toBeNull();
  });
});
