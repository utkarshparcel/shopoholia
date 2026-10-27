import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { InMemoryMetricsSink } from "./parsers/metrics.js";
import { parseEml } from "./spikes/parser-accuracy/fixtures/load.js";
import {
  isAuthOrTokenError,
  processIngestJob,
  processSmsDocument,
  type IngestPersister,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const amazonMsg = parseEml(
  readFileSync(join(here, "spikes/parser-accuracy/fixtures/amazon.eml"), "utf8"),
  "amazon-1",
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

describe("processIngestJob", () => {
  it("persists a matched purchase, marks the document MATCHED, and emits a coverage metric", async () => {
    const { persister, calls } = fakePersister();
    const metrics = new InMemoryMetricsSink();

    const result = await processIngestJob(amazonMsg, {
      persister,
      sourceKind: "EMAIL",
      documentId: "doc-1",
      sourceId: "src-1",
      metrics,
    });

    expect(result.matched).toBe(true);
    expect(result.purchaseId).toBe("pid-1");

    expect(calls.insert).toHaveBeenCalledOnce();
    const [purchase, opts] = calls.insert.mock.calls[0]!;
    expect(purchase.merchant).toBe("AMAZON");
    expect(purchase.totalMinor).toBe(129900);
    expect(opts).toEqual({ sourceKind: "EMAIL", rawDocId: "doc-1" });

    expect(calls.mark).toHaveBeenCalledWith("doc-1", "MATCHED", "pid-1");
    expect(calls.cursor).toHaveBeenCalledWith("src-1", amazonMsg.messageId);

    expect(metrics.events).toHaveLength(1);
    expect(metrics.events[0]!.matched).toBe(true);
    expect(metrics.events[0]!.merchant).toBe("AMAZON");
  });
});

describe("processSmsDocument (B4)", () => {
  it("parses an SMS body into a purchase and persists it as an SMS source", async () => {
    const { persister, calls } = fakePersister();
    const doc = {
      id: "sms-doc-1",
      parsedJson: {
        from: "+919999999999",
        body: "Flipkart: Your order #FK-X129 has shipped. Total paid Rs. 749.00",
        receivedAt: "2025-08-20T10:00:00.000Z",
      },
    };

    const result = await processSmsDocument(doc, persister);

    expect(result.matched).toBe(true);
    expect(calls.insert).toHaveBeenCalledOnce();
    const [purchase, opts] = calls.insert.mock.calls[0]!;
    expect(opts).toEqual({ sourceKind: "SMS", rawDocId: "sms-doc-1" });
    expect(purchase.totalMinor).toBe(74900);
    expect(calls.mark).toHaveBeenCalledWith("sms-doc-1", "MATCHED", "pid-1");
  });
});

describe("isAuthOrTokenError", () => {
  it("detects token / oauth / unauthorized failures for source health", () => {
    expect(isAuthOrTokenError(new Error("No stored Gmail tokens"))).toBe(true);
    expect(isAuthOrTokenError("invalid_grant")).toBe(true);
    expect(isAuthOrTokenError("Gmail history.list failed: 401")).toBe(true);
    expect(isAuthOrTokenError(new Error("Failed to decrypt Gmail tokens"))).toBe(true);
    expect(isAuthOrTokenError(new Error("parser mismatch"))).toBe(false);
    expect(isAuthOrTokenError(new Error("csrf token missing"))).toBe(false);
  });
});
