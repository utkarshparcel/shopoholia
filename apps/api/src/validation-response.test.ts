import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestServer } from "./test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

/**
 * A request that fails its schema gets Fastify's 400 with the zod issues in `message`. Clients
 * read this body, so it stays exactly as it was with zod 3 (see lib/zod-messages.ts).
 */
describe("validation error responses", () => {
  let app: App;

  beforeAll(async () => {
    ({ app } = await buildTestServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it("names each failing body field with zod 3's wording", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/verify",
      payload: { phone: "123", otp: 123456 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(
      JSON.stringify({
        statusCode: 400,
        code: "FST_ERR_VALIDATION",
        error: "Bad Request",
        message: "body/phone String must contain at least 10 character(s), body/otp Expected string, received number",
      }),
    );
  });

  it("says Required for a missing field, through a route's own 400 schema", async () => {
    // /auth/otp declares `400: ErrorSchema`, so the body is serialized to { error, message }.
    const res = await app.inject({ method: "POST", url: "/auth/otp", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(JSON.stringify({ error: "Bad Request", message: "body/phone Required" }));
  });

  it("says Invalid uuid for a malformed path id", async () => {
    const res = await app.inject({ method: "GET", url: "/payments/intents/not-a-uuid" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      code: "FST_ERR_VALIDATION",
      error: "Bad Request",
      message: "params/id Invalid uuid",
    });
  });
});
