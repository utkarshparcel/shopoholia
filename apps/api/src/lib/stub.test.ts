import { describe, expect, it } from "vitest";
import { notImplemented } from "./stub.js";

describe("notImplemented", () => {
  it("returns 501 payload", () => {
    const sent = { status: 0, body: null as unknown };
    const reply = {
      code: (status: number) => ({
        send: (body: unknown) => {
          sent.status = status;
          sent.body = body;
          return sent;
        },
      }),
    } as never;

    notImplemented(reply, "GET /feed");
    expect(sent.status).toBe(501);
    expect(sent.body).toMatchObject({ error: "Not Implemented" });
  });
});
