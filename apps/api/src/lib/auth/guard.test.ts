import { describe, expect, it, vi } from "vitest";
import { requireAuth } from "./guard.js";

describe("requireAuth", () => {
  it("sets user on valid jwt", async () => {
    const user = { sub: "u1", phone: "919876543210" };
    const request = {
      jwtVerify: vi.fn(async function (this: { user?: typeof user }) {
        this.user = user;
      }),
      user: undefined as typeof user | undefined,
    } as never;
    const reply = { code: vi.fn(() => ({ send: vi.fn() })) } as never;

    await requireAuth(request, reply);
    expect(request.user).toEqual(user);
  });

  it("returns 401 on invalid jwt", async () => {
    const send = vi.fn();
    const request = {
      jwtVerify: vi.fn(async () => {
        throw new Error("bad");
      }),
    } as never;
    const reply = { code: vi.fn(() => ({ send })) } as never;

    await requireAuth(request, reply);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(send).toHaveBeenCalledWith({
      error: "Unauthorized",
      message: "Invalid or missing token",
    });
  });
});
