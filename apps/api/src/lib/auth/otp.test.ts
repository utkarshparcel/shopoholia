import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../index.js";
import { createDevOtpService, OTP_SEND_LIMIT, OtpRateLimitError } from "./otp.js";
import { createMemoryRepositories } from "../repositories/memory.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDevOtpService", () => {
  it("sends and verifies dev otp", async () => {
    const repos = createMemoryRepositories();
    const otp = createDevOtpService(repos);
    const sent = await otp.sendOtp("919876543210");
    expect(sent.message).toContain("123456");
    expect(await otp.verifyOtp("919876543210", "123456")).toBe(true);
    expect(await otp.verifyOtp("919876543210", "000000")).toBe(false);
  });

  it("doesn't apply the send limit to dev codes", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const otp = createDevOtpService(createMemoryRepositories());
    for (let i = 0; i <= OTP_SEND_LIMIT.max * 2; i++) {
      await expect(otp.sendOtp("919876543210")).resolves.toMatchObject({
        message: expect.stringContaining("123456"),
      });
    }
    expect(await otp.verifyOtp("919876543210", "123456")).toBe(true);
  });

  it("still refuses to send in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const otp = createDevOtpService(createMemoryRepositories());
    await expect(otp.sendOtp("919876543210")).rejects.toThrow("not available");
  });

  it("applies a send limit that is passed in", async () => {
    const otp = createDevOtpService(createMemoryRepositories(), {
      sendLimit: { max: 2, windowMs: 3600_000 },
    });
    await otp.sendOtp("919876543210");
    await otp.sendOtp("919876543210");
    await expect(otp.sendOtp("919876543210")).rejects.toBeInstanceOf(OtpRateLimitError);
  });
});

describe("OtpRateLimitError", () => {
  it("says how long to wait in minutes, rounded up", () => {
    const now = Date.parse("2026-11-02T07:00:00.000Z");
    expect(new OtpRateLimitError(new Date(now + 59 * 60_000 + 1), now).message).toBe(
      "Too many codes sent. Try again in 60 minutes.",
    );
    expect(new OtpRateLimitError(new Date(now + 5_000), now).message).toBe(
      "Too many codes sent. Try again in 1 minute.",
    );
    expect(new OtpRateLimitError(new Date(now - 5_000), now).message).toBe(
      "Too many codes sent. Try again in 1 minute.",
    );
  });
});

describe("POST /auth/otp when the send limit is hit", () => {
  it("answers 429 with a readable message and the wait in retry-after", async () => {
    const repos = createMemoryRepositories();
    const otp = createDevOtpService(repos, { sendLimit: { max: 1, windowMs: 3600_000 } });
    const app = await buildServer({ logger: false, deps: { repos, otp } });
    const send = () =>
      app.inject({ method: "POST", url: "/auth/otp", payload: { phone: "919876543210" } });

    expect((await send()).statusCode).toBe(200);
    const res = await send();

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: "Too Many Requests",
      message: "Too many codes sent. Try again in 60 minutes.",
    });
    const retryAfter = Number(res.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(3500);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    await app.close();
  });
});
