import { describe, expect, it } from "vitest";
import {
  BALANCE_RECHECK_INTERVAL_MS,
  balanceRecheckCopy,
  balanceRecheckJobId,
  computeBalanceRecheckDelayMs,
  merchantBalanceCapability,
  needsBalanceRecheckReminder,
} from "./merchantBalanceCheck.js";

describe("merchantBalanceCapability", () => {
  it("marks Amazon / Flipkart as api-capable", () => {
    expect(merchantBalanceCapability("Amazon.in").mode).toBe("api");
    expect(merchantBalanceCapability("Amazon.in").apiCapable).toBe(true);
    expect(merchantBalanceCapability("Flipkart").apiCapable).toBe(true);
    expect(merchantBalanceCapability("Amazon.in").checkUrl).toContain("amazon");
  });

  it("marks unknown merchants as manual", () => {
    const c = merchantBalanceCapability("Corner Boutique");
    expect(c.mode).toBe("manual");
    expect(c.apiCapable).toBe(false);
    expect(c.checkUrl).toBeNull();
  });

  it("returns myntra manual check URL", () => {
    expect(merchantBalanceCapability("Myntra").checkUrl).toContain("myntra");
    expect(merchantBalanceCapability("Myntra").mode).toBe("manual");
  });

  it("resolves check URL via merchant prefix / substring match", () => {
    const amazonPay = merchantBalanceCapability("Amazon Pay");
    expect(amazonPay.apiCapable).toBe(true);
    expect(amazonPay.checkUrl).toContain("amazon");

    // No exact MANUAL_CHECK_URL key — prefix match against known pages.
    const swiggyExtra = merchantBalanceCapability("Swiggy Instamart");
    expect(swiggyExtra.checkUrl).toContain("swiggy");
  });
});

describe("needsBalanceRecheckReminder", () => {
  it("is due when never checked", () => {
    expect(needsBalanceRecheckReminder(null)).toBe(true);
    expect(needsBalanceRecheckReminder(undefined)).toBe(true);
  });

  it("is due after the interval", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const stale = new Date(now.getTime() - BALANCE_RECHECK_INTERVAL_MS);
    expect(needsBalanceRecheckReminder(stale, { now })).toBe(true);
    expect(
      needsBalanceRecheckReminder(
        new Date(now.getTime() - BALANCE_RECHECK_INTERVAL_MS + 60_000),
        { now },
      ),
    ).toBe(false);
  });
});

describe("computeBalanceRecheckDelayMs", () => {
  it("returns 100ms when already due", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const last = new Date(now.getTime() - BALANCE_RECHECK_INTERVAL_MS - 1000);
    expect(computeBalanceRecheckDelayMs(last, { now })).toBe(100);
  });

  it("returns remaining ms until interval elapses", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const last = new Date(now.getTime() - 10 * 86_400_000);
    expect(computeBalanceRecheckDelayMs(last, { now })).toBe(
      BALANCE_RECHECK_INTERVAL_MS - 10 * 86_400_000,
    );
  });
});

describe("balanceRecheck helpers", () => {
  it("stable job id + copy", () => {
    expect(balanceRecheckJobId("acc-1")).toBe("credit-balance-recheck:acc-1");
    expect(balanceRecheckCopy("Myntra").title).toContain("Myntra");
  });
});
