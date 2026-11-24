import { describe, expect, it } from "vitest";
import { inAgentWindow, nextWindowStart, parseAgentWindow, windowEndAfter, type AgentWindow } from "./backend.js";

const NIGHT = parseAgentWindow("23:00-06:30")!;
const DAY = parseAgentWindow("09:00-17:00")!;

function window(at: string, w: AgentWindow, timeZone: string) {
  const now = new Date(at);
  return {
    start: nextWindowStart(now, w, timeZone).toISOString(),
    end: windowEndAfter(now, w, timeZone)?.toISOString() ?? null,
  };
}

describe("the agent window across daylight saving", () => {
  it("Asia/Kolkata (no daylight saving) is unchanged", () => {
    // 12:00 IST: opens 23:00 IST, closes 06:30 IST.
    expect(window("2026-11-04T06:30:00.000Z", NIGHT, "Asia/Kolkata")).toEqual({
      start: "2026-11-04T17:30:00.000Z",
      end: "2026-11-05T01:00:00.000Z",
    });
    // Inside the window: it is open now and closes 06:30 IST.
    expect(window("2026-11-04T20:00:00.000Z", NIGHT, "Asia/Kolkata")).toEqual({
      start: "2026-11-04T20:00:00.000Z",
      end: "2026-11-05T01:00:00.000Z",
    });
    expect(window("2026-03-28T06:30:00.000Z", DAY, "Asia/Kolkata")).toEqual({
      start: "2026-03-28T06:30:00.000Z",
      end: "2026-03-28T11:30:00.000Z",
    });
  });

  it("Europe/London, clocks forward (28 March 2027): the night closes 06:30 BST", () => {
    // Saturday 12:00 GMT. Opens 23:00 GMT; closes 06:30 BST (05:30 UTC), not 06:30 UTC.
    expect(window("2027-03-27T12:00:00.000Z", NIGHT, "Europe/London")).toEqual({
      start: "2027-03-27T23:00:00.000Z",
      end: "2027-03-28T05:30:00.000Z",
    });
    // Saturday 18:00 GMT: the day window opens Sunday 09:00 BST (08:00 UTC).
    expect(window("2027-03-27T18:00:00.000Z", DAY, "Europe/London")).toEqual({
      start: "2027-03-28T08:00:00.000Z",
      end: "2027-03-28T16:00:00.000Z",
    });
  });

  it("Europe/London, clocks back (25 October 2026): the night opens 23:00 BST and closes 06:30 GMT", () => {
    expect(window("2026-10-24T11:00:00.000Z", NIGHT, "Europe/London")).toEqual({
      start: "2026-10-24T22:00:00.000Z",
      end: "2026-10-25T06:30:00.000Z",
    });
    // 03:00 GMT on the night itself, inside the window: still closes 06:30 GMT.
    expect(window("2026-10-25T03:00:00.000Z", NIGHT, "Europe/London")).toEqual({
      start: "2026-10-25T03:00:00.000Z",
      end: "2026-10-25T06:30:00.000Z",
    });
  });

  it("America/New_York, clocks back (1 November 2026) and forward (14 March 2027)", () => {
    // 12:00 EDT: opens 23:00 EDT (03:00 UTC), closes 06:30 EST (11:30 UTC).
    expect(window("2026-10-31T16:00:00.000Z", NIGHT, "America/New_York")).toEqual({
      start: "2026-11-01T03:00:00.000Z",
      end: "2026-11-01T11:30:00.000Z",
    });
    // 12:00 EST: opens 23:00 EST (04:00 UTC), closes 06:30 EDT (10:30 UTC).
    expect(window("2027-03-13T17:00:00.000Z", NIGHT, "America/New_York")).toEqual({
      start: "2027-03-14T04:00:00.000Z",
      end: "2027-03-14T10:30:00.000Z",
    });
  });

  it("a start in the skipped hour opens when the clock shows the hour after; a repeated one, the first time", () => {
    const early = parseAgentWindow("01:30-05:00")!;
    // 01:30 does not exist in London on 28 March 2027: it opens at 01:30 UTC (02:30 BST).
    expect(nextWindowStart(new Date("2027-03-27T12:00:00.000Z"), early, "Europe/London").toISOString()).toBe(
      "2027-03-28T01:30:00.000Z",
    );
    expect(inAgentWindow(new Date("2027-03-28T01:30:00.000Z"), early, "Europe/London")).toBe(true);
    // 01:30 happens twice on 25 October 2026: the first, 01:30 BST (00:30 UTC).
    expect(nextWindowStart(new Date("2026-10-24T11:00:00.000Z"), early, "Europe/London").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("always has no start to wait for and no end", () => {
    const now = new Date("2026-10-25T01:30:00.000Z");
    expect(nextWindowStart(now, { kind: "always" }, "Europe/London")).toBe(now);
    expect(windowEndAfter(now, { kind: "always" }, "Europe/London")).toBeNull();
  });
});
