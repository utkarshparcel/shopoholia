import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_SCHEDULE,
  retentionDaysFor,
  retentionSchedule,
  shouldPurgeRaw,
} from "./retention-schedule.js";

const ENV_KEYS = [
  "INGESTION_RETENTION_DAYS",
  "INGESTION_RETENTION_DAYS_EMAIL",
  "INGESTION_RETENTION_DAYS_SMS",
  "INGESTION_RETENTION_DAYS_RECEIPT",
] as const;

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("worker retention schedule", () => {
  afterEach(clearEnv);

  it("matches API defaults EMAIL 7 / SMS 14 / RECEIPT 30", () => {
    clearEnv();
    expect(retentionSchedule()).toEqual(DEFAULT_RETENTION_SCHEDULE);
    expect(retentionDaysFor("EMAIL")).toBe(7);
  });

  it("flags MATCHED email past EMAIL TTL for purge", () => {
    clearEnv();
    const now = Date.now();
    expect(
      shouldPurgeRaw({
        kind: "EMAIL",
        status: "MATCHED",
        createdAt: new Date(now - 10 * 86_400_000),
        rawKey: "raw/a.eml",
        now,
      }),
    ).toBe(true);
    expect(
      shouldPurgeRaw({
        kind: "SMS",
        status: "MATCHED",
        createdAt: new Date(now - 10 * 86_400_000),
        rawKey: "raw/b.txt",
        now,
      }),
    ).toBe(false);
  });

  it("purges every status past TTL, never an empty rawKey", () => {
    clearEnv();
    const now = Date.now();
    for (const status of ["RECEIVED", "PARSED", "MATCHED", "UNMATCHED", "ERROR"]) {
      expect(
        shouldPurgeRaw({
          kind: "EMAIL",
          status,
          createdAt: new Date(now - 40 * 86_400_000),
          rawKey: "raw/c.eml",
          now,
        }),
      ).toBe(true);
    }
    expect(
      shouldPurgeRaw({
        kind: "EMAIL",
        status: "MATCHED",
        createdAt: new Date(now - 40 * 86_400_000),
        rawKey: "",
        now,
      }),
    ).toBe(false);
  });

  it("ignores non-positive env overrides (parsePositiveDays null path)", () => {
    clearEnv();
    process.env.INGESTION_RETENTION_DAYS_EMAIL = "0";
    process.env.INGESTION_RETENTION_DAYS = "-3";
    expect(retentionDaysFor("EMAIL")).toBe(DEFAULT_RETENTION_SCHEDULE.EMAIL);
    clearEnv();
    process.env.INGESTION_RETENTION_DAYS_EMAIL = "not-a-number";
    expect(retentionDaysFor("EMAIL")).toBe(DEFAULT_RETENTION_SCHEDULE.EMAIL);
  });
});
