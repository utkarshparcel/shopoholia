import { describe, expect, it } from "vitest";
import { inWindow, msUntilWindow, nextWindowStart, parseWindow } from "./window.js";

const NIGHT = parseWindow("23:00-06:30");
const HOUR = 3600_000;

function opensAt(at: string, timeZone: string, window = NIGHT) {
  return nextWindowStart(new Date(at), window, timeZone).toISOString();
}

describe("the window", () => {
  it("parses always and HH:MM-HH:MM, and refuses anything else", () => {
    expect(parseWindow(undefined)).toEqual({ kind: "always" });
    expect(parseWindow("always")).toEqual({ kind: "always" });
    expect(NIGHT).toEqual({ kind: "range", startMin: 23 * 60, endMin: 6 * 60 + 30 });
    expect(() => parseWindow("nightly")).toThrow(/not understood/);
    expect(() => parseWindow("25:00-06:00")).toThrow(/invalid/);
    expect(() => parseWindow("06:00-06:00")).toThrow(/empty/);
  });

  it("Asia/Kolkata is unchanged: 12:00 IST waits 11 h for 23:00", () => {
    const noon = new Date("2026-11-04T06:30:00.000Z");
    expect(inWindow(noon, NIGHT, "Asia/Kolkata")).toBe(false);
    expect(msUntilWindow(noon, NIGHT, "Asia/Kolkata")).toBe(11 * HOUR);
    expect(opensAt("2026-03-28T06:30:00.000Z", "Asia/Kolkata")).toBe("2026-03-28T17:30:00.000Z");
    expect(inWindow(new Date("2026-11-04T20:00:00.000Z"), NIGHT, "Asia/Kolkata")).toBe(true);
    expect(msUntilWindow(new Date("2026-11-04T20:00:00.000Z"), NIGHT, "Asia/Kolkata")).toBe(0);
  });

  it("Europe/London: opens at local 09:00 the morning the clocks go forward or back", () => {
    const day = parseWindow("09:00-17:00");
    // Saturday 18:00 GMT before 28 March 2027: Sunday 09:00 BST is 08:00 UTC, 14 h away (not 15).
    expect(opensAt("2027-03-27T18:00:00.000Z", "Europe/London", day)).toBe("2027-03-28T08:00:00.000Z");
    expect(msUntilWindow(new Date("2027-03-27T18:00:00.000Z"), day, "Europe/London")).toBe(14 * HOUR);
    // Saturday 18:00 BST before 25 October 2026: Sunday 09:00 GMT, 16 h away (not 15).
    expect(opensAt("2026-10-24T17:00:00.000Z", "Europe/London", day)).toBe("2026-10-25T09:00:00.000Z");
    expect(msUntilWindow(new Date("2026-10-24T17:00:00.000Z"), day, "Europe/London")).toBe(16 * HOUR);
  });

  it("Europe/London: the night window closes at 06:30 local on a transition night", () => {
    // 28 March 2027, clocks forward at 01:00 UTC: 06:30 BST is 05:30 UTC.
    expect(inWindow(new Date("2027-03-28T05:29:00.000Z"), NIGHT, "Europe/London")).toBe(true);
    expect(inWindow(new Date("2027-03-28T05:30:00.000Z"), NIGHT, "Europe/London")).toBe(false);
    // ...and then waits until 23:00 BST (22:00 UTC).
    expect(opensAt("2027-03-28T05:30:00.000Z", "Europe/London")).toBe("2027-03-28T22:00:00.000Z");
    // 25 October 2026, clocks back at 01:00 UTC: 06:30 GMT is 06:30 UTC.
    expect(inWindow(new Date("2026-10-25T06:29:00.000Z"), NIGHT, "Europe/London")).toBe(true);
    expect(inWindow(new Date("2026-10-25T06:30:00.000Z"), NIGHT, "Europe/London")).toBe(false);
  });

  it("America/New_York: opens at local time around both transitions", () => {
    // 1 November 2026 (clocks back on the night): 23:00 EDT on 31 October is 03:00 UTC.
    expect(opensAt("2026-10-31T16:00:00.000Z", "America/New_York")).toBe("2026-11-01T03:00:00.000Z");
    // After the change, from 07:00 EST: 23:00 EST is 04:00 UTC, 16 h away.
    expect(msUntilWindow(new Date("2026-11-01T12:00:00.000Z"), NIGHT, "America/New_York")).toBe(16 * HOUR);
    expect(opensAt("2026-11-01T12:00:00.000Z", "America/New_York")).toBe("2026-11-02T04:00:00.000Z");
    // 8 March 2026 (clocks forward at 07:00 UTC): from midnight EST, 09:00 EDT is 13:00 UTC, 8 h away (not 9).
    const day = parseWindow("09:00-17:00");
    expect(opensAt("2026-03-08T05:00:00.000Z", "America/New_York", day)).toBe("2026-03-08T13:00:00.000Z");
    expect(msUntilWindow(new Date("2026-03-08T05:00:00.000Z"), day, "America/New_York")).toBe(8 * HOUR);
  });
});
