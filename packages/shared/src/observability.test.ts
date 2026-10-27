import { describe, expect, it } from "vitest";
import { sentrySmokeMessage, wornSentryTags } from "./observability.js";

describe("wornSentryTags", () => {
  it("tags Closet screens with worn_surface + closet_screen", () => {
    expect(wornSentryTags({ surface: "closet", screen: "Vault" })).toEqual({
      worn_surface: "closet",
      closet_screen: "Vault",
    });
  });

  it("tags workers by name", () => {
    expect(wornSentryTags({ surface: "worker", worker: "expiry" })).toEqual({
      worn_surface: "worker",
      worker: "expiry",
    });
  });
});

describe("sentrySmokeMessage", () => {
  it("builds a stable smoke event name", () => {
    expect(sentrySmokeMessage("closet")).toBe("worn.smoke.closet");
    expect(sentrySmokeMessage("worker", "ingest")).toBe("worn.smoke.worker.ingest");
  });
});
