import { describe, expect, it } from "vitest";
import { createDevOtpService } from "./otp.js";
import { createMemoryRepositories } from "../repositories/memory.js";

describe("createDevOtpService", () => {
  it("sends and verifies dev otp", async () => {
    const repos = createMemoryRepositories();
    const otp = createDevOtpService(repos);
    const sent = await otp.sendOtp("919876543210");
    expect(sent.message).toContain("123456");
    expect(await otp.verifyOtp("919876543210", "123456")).toBe(true);
    expect(await otp.verifyOtp("919876543210", "000000")).toBe(false);
  });
});
