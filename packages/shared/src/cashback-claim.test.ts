import { describe, expect, it } from "vitest";
import {
  compareCashbackClaimsByDeadline,
  cashbackClaimStartUrl,
  cashbackClaimReminderJobId,
  encodeCashbackClaimNotes,
  extractCashbackClaimUrl,
  stripCashbackClaimUrlFromNotes,
  CASHBACK_CLAIM_LEAD_MS,
} from "./cashback-claim.js";

describe("cashback-claim helpers (U006)", () => {
  it("encodes and extracts claimUrl in notes", () => {
    const notes = encodeCashbackClaimNotes("Fashion fest", "https://hdfc.example/claim");
    expect(extractCashbackClaimUrl(notes)).toBe("https://hdfc.example/claim");
    expect(stripCashbackClaimUrlFromNotes(notes)).toBe("Fashion fest");
  });

  it("handles notes/url edge cases for encode/extract/strip", () => {
    expect(encodeCashbackClaimNotes(null, null)).toBeNull();
    expect(encodeCashbackClaimNotes("  ", "  ")).toBeNull();
    expect(encodeCashbackClaimNotes("keep me", null)).toBe("keep me");
    expect(encodeCashbackClaimNotes(null, "https://x.example/c")).toBe(
      "claimUrl=https://x.example/c",
    );
    expect(encodeCashbackClaimNotes("claimUrl=https://old.example\nbody", "https://new.example")).toBe(
      "claimUrl=https://new.example\nbody",
    );
    expect(extractCashbackClaimUrl(null)).toBeNull();
    expect(extractCashbackClaimUrl("no url here")).toBeNull();
    expect(stripCashbackClaimUrlFromNotes(null)).toBeNull();
    expect(stripCashbackClaimUrlFromNotes("claimUrl=https://only.example")).toBeNull();
  });

  it("sorts by deadline ascending with nulls last", () => {
    const a = { expiresAt: "2026-09-10T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" };
    const b = { expiresAt: "2026-09-01T00:00:00.000Z", createdAt: "2026-01-02T00:00:00.000Z" };
    const c = { expiresAt: null, createdAt: "2026-01-03T00:00:00.000Z" };
    const sorted = [c, a, b].sort(compareCashbackClaimsByDeadline);
    expect(sorted.map((x) => x.expiresAt)).toEqual([
      "2026-09-01T00:00:00.000Z",
      "2026-09-10T00:00:00.000Z",
      null,
    ]);
  });

  it("ties on same deadline prefer newer createdAt", () => {
    const older = {
      expiresAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const newer = {
      expiresAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-01-05T00:00:00.000Z",
    };
    expect(compareCashbackClaimsByDeadline(older, newer)).toBeGreaterThan(0);
    expect([older, newer].sort(compareCashbackClaimsByDeadline)[0]).toBe(newer);
  });

  it("resolves soft claim-start portals without partnership claims", () => {
    expect(cashbackClaimStartUrl("HDFC Swiggy")).toContain("hdfcbank");
    expect(cashbackClaimStartUrl("Axis Magenta")).toContain("axisbank");
    expect(cashbackClaimStartUrl("ICICI Amazon Pay")).toContain("icicibank");
    expect(cashbackClaimStartUrl("SBI Card")).toContain("onlinesbi");
    expect(cashbackClaimStartUrl("State Bank rewards")).toContain("onlinesbi");
    expect(cashbackClaimStartUrl("Amex MR")).toContain("americanexpress");
    expect(cashbackClaimStartUrl("American Express")).toContain("americanexpress");
    expect(cashbackClaimStartUrl("  ")).toBeNull();
    expect(cashbackClaimStartUrl("Unknown", "https://portal.example/x")).toBe(
      "https://portal.example/x",
    );
    expect(cashbackClaimStartUrl("Local boutique")).toBeNull();
  });

  it("uses 3-day lead and stable reminder job id", () => {
    expect(CASHBACK_CLAIM_LEAD_MS).toBe(3 * 86_400_000);
    expect(cashbackClaimReminderJobId("claim-1")).toBe(
      "cashback-claim-deadline:claim-1",
    );
  });
});
