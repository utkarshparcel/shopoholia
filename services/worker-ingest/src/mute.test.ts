import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  isMerchantMuted,
  mutedMerchantsFromMeta,
  normalizeMerchant,
} from "./mute.js";
import { processIngestJob, type IngestPersister } from "./index.js";
import { parseEml } from "./spikes/parser-accuracy/fixtures/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const amazonMsg = parseEml(
  readFileSync(join(here, "spikes/parser-accuracy/fixtures/amazon.eml"), "utf8"),
  "amazon-mute",
);

function fakePersister() {
  const calls = {
    insert: vi.fn(async () => "pid-1"),
    mark: vi.fn(async () => undefined),
    cursor: vi.fn(async () => undefined),
  };
  const persister: IngestPersister = {
    insertPurchase: calls.insert,
    markDocument: calls.mark,
    updateSourceCursor: calls.cursor,
  };
  return { persister, calls };
}

describe("merchant mute helpers", () => {
  it("normalizes merchant names", () => {
    expect(normalizeMerchant("  swiggy ")).toBe("SWIGGY");
  });

  it("reads mutedMerchants from source meta", () => {
    expect(mutedMerchantsFromMeta(null)).toEqual([]);
    expect(mutedMerchantsFromMeta({})).toEqual([]);
    expect(
      mutedMerchantsFromMeta({ mutedMerchants: ["Swiggy", " ZOMATO ", ""] }),
    ).toEqual(["SWIGGY", "ZOMATO"]);
    expect(mutedMerchantsFromMeta({ mutedMerchants: "nope" as never })).toEqual(
      [],
    );
  });

  it("matches muted merchants case-insensitively", () => {
    expect(isMerchantMuted("Swiggy", ["SWIGGY", "ZOMATO"])).toBe(true);
    expect(isMerchantMuted("amazon", ["SWIGGY"])).toBe(false);
    expect(isMerchantMuted(null, ["SWIGGY"])).toBe(false);
    expect(isMerchantMuted("Swiggy", [])).toBe(false);
  });
});

describe("processIngestJob muted filter (N47)", () => {
  it("skips purchase insert when merchant is muted", async () => {
    const { persister, calls } = fakePersister();

    const result = await processIngestJob(amazonMsg, {
      persister,
      sourceKind: "EMAIL",
      documentId: "doc-mute",
      sourceId: "src-1",
      mutedMerchants: ["amazon", "SWIGGY"],
    });

    expect(result.matched).toBe(false);
    expect(result.skippedMuted).toBe(true);
    expect(result.purchase?.merchant).toBe("AMAZON");
    expect(calls.insert).not.toHaveBeenCalled();
    expect(calls.mark).toHaveBeenCalledWith("doc-mute", "UNMATCHED");
    expect(calls.cursor).toHaveBeenCalledWith("src-1", amazonMsg.messageId);
  });

  it("persists when merchant is not muted", async () => {
    const { persister, calls } = fakePersister();

    const result = await processIngestJob(amazonMsg, {
      persister,
      sourceKind: "EMAIL",
      documentId: "doc-ok",
      sourceId: "src-1",
      mutedMerchants: ["SWIGGY", "ZOMATO"],
    });

    expect(result.matched).toBe(true);
    expect(result.skippedMuted).toBeUndefined();
    expect(calls.insert).toHaveBeenCalledOnce();
    expect(calls.mark).toHaveBeenCalledWith("doc-ok", "MATCHED", "pid-1");
  });
});
