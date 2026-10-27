import { describe, expect, it } from "vitest";

import { expiryBadge } from "./expiryBadge";

describe("expiryBadge", () => {
  const now = new Date("2026-01-15T00:00:00.000Z");

  it("returns ok when there is no expiry", () => {
    expect(expiryBadge(null, now)).toBe("ok");
  });

  it("returns expired when the date is in the past", () => {
    expect(expiryBadge("2026-01-10T00:00:00.000Z", now)).toBe("expired");
  });

  it("returns expired exactly at now", () => {
    expect(expiryBadge("2026-01-15T00:00:00.000Z", now)).toBe("expired");
  });

  it("returns soon within the 14-day window", () => {
    expect(expiryBadge("2026-01-20T00:00:00.000Z", now)).toBe("soon");
    expect(expiryBadge("2026-01-29T00:00:00.000Z", now)).toBe("soon");
  });

  it("returns ok beyond the 14-day window", () => {
    expect(expiryBadge("2026-02-01T00:00:00.000Z", now)).toBe("ok");
  });

  it("returns ok for an unparseable date", () => {
    expect(expiryBadge("not-a-date", now)).toBe("ok");
  });
});
