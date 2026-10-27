import { describe, expect, it, vi } from "vitest";
import { requireConsent, requireConsentHandler } from "./consent.js";

function mockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe("requireConsent", () => {
  it("returns 401 when the request has no authenticated user", async () => {
    const reply = mockReply();
    const request = {
      user: undefined,
      server: { deps: { repos: { findActiveConsent: vi.fn() } } },
    } as never;

    await requireConsentHandler("FINANCIAL", request, reply as never);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
    );
  });

  it("returns 403 when the scope grant is missing", async () => {
    const reply = mockReply();
    const findActiveConsent = vi.fn().mockResolvedValue(null);
    const request = {
      user: { sub: "u1" },
      server: { deps: { repos: { findActiveConsent } } },
    } as never;

    await requireConsentHandler("EMAIL", request, reply as never);
    expect(findActiveConsent).toHaveBeenCalledWith("u1", "EMAIL");
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("EMAIL"),
      }),
    );
  });

  it("resolves when an active grant exists", async () => {
    const reply = mockReply();
    const request = {
      user: { sub: "u1" },
      server: {
        deps: {
          repos: {
            findActiveConsent: vi.fn().mockResolvedValue({ id: "c1" }),
          },
        },
      },
    } as never;

    await expect(
      requireConsentHandler("FINANCIAL", request, reply as never),
    ).resolves.toBeUndefined();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it("factory returns a preHandler bound to the scope", async () => {
    const reply = mockReply();
    const findActiveConsent = vi.fn().mockResolvedValue(null);
    const request = {
      user: { sub: "u1" },
      server: { deps: { repos: { findActiveConsent } } },
    } as never;

    await requireConsent("SMMS")(request, reply as never);
    expect(findActiveConsent).toHaveBeenCalledWith("u1", "SMMS");
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
