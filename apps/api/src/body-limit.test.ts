import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestServer } from "./test-utils.js";

type App = Awaited<ReturnType<typeof buildTestServer>>["app"];

describe("request body limit", () => {
  let app: App;

  beforeAll(async () => {
    ({ app } = await buildTestServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses a JSON body over 1 MiB before any schema validation runs", async () => {
    // An oversized collection: refused on size alone, before zod sees it.
    const items = Array.from({ length: 300_000 }, () => "x");
    const payload = JSON.stringify({ phone: "919876543210", items });
    expect(Buffer.byteLength(payload)).toBeGreaterThan(1024 * 1024);
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp",
      headers: { "content-type": "application/json" },
      payload,
    });
    expect(res.statusCode).toBe(413);
  });
});
