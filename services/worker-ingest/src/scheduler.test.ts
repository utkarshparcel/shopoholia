import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ingestionSources, type Db } from "@worn/db";
import { parseEml } from "./spikes/parser-accuracy/fixtures/load.js";
import { ConsentRequiredError, type EmailConnector } from "./connectors/types.js";
import {
  createMemoryIngestWorker,
  processResync,
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

function fakeDb(sourceRow: unknown, grantRow: unknown) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () =>
            table === ingestionSources ? [sourceRow] : [grantRow],
          ),
        })),
      })),
    })),
  } as unknown as Db;
}

const SOURCE = {
  id: "src-1",
  consentGrantId: "g-1",
  provider: "gmail",
  cursor: "h0",
  encryptedToken: null,
};

describe("processResync (B5)", () => {
  it("syncs via the connector, persists messages, and advances the cursor", async () => {
    const { persister, calls } = fakePersister();
    const connector: EmailConnector = {
      id: "fake",
      buildOAuthUrl: () => "",
      completeOAuth: async () => ({ accessToken: "x" }),
      listSince: vi.fn(async (cursor, consent) => {
        if (consent.revokedAt) throw new ConsentRequiredError();
        return { messages: [amazonMsg], nextCursor: "h9" };
      }),
    };
    const connectorFactory = vi.fn(() => connector);
    const db = fakeDb(SOURCE, { id: "g-1", revokedAt: null });

    const seen = await processResync("src-1", {
      db,
      persister,
      connectorFactory,
    });

    expect(seen).toBe(1);
    expect(connectorFactory).toHaveBeenCalledWith({
      id: "src-1",
      provider: "gmail",
      encryptedToken: null,
    });
    expect(connector.listSince).toHaveBeenCalledWith("h0", {
      id: "g-1",
      revokedAt: null,
    });
    expect(calls.insert).toHaveBeenCalledOnce();
    expect(calls.cursor).toHaveBeenCalledWith("src-1", "h9");
  });

  it("refuses to sync when the consent grant is revoked", async () => {
    const { persister, calls } = fakePersister();
    const connector: EmailConnector = {
      id: "fake",
      buildOAuthUrl: () => "",
      completeOAuth: async () => ({ accessToken: "x" }),
      listSince: vi.fn(async (cursor, consent) => {
        if (consent.revokedAt) throw new ConsentRequiredError();
        return { messages: [amazonMsg], nextCursor: "h9" };
      }),
    };
    const db = fakeDb(SOURCE, {
      id: "g-1",
      revokedAt: new Date("2025-01-01"),
    });

    await expect(
      processResync("src-1", {
        db,
        persister,
        connectorFactory: () => connector,
      }),
    ).rejects.toMatchObject({ name: "ConsentRequiredError" });
    expect(calls.insert).not.toHaveBeenCalled();
  });
});

describe("in-memory resync scheduler", () => {
  it("scheduleResync enqueues a delayed job the worker later runs", async () => {
    const { persister, calls } = fakePersister();
    const connector: EmailConnector = {
      id: "fake",
      buildOAuthUrl: () => "",
      completeOAuth: async () => ({ accessToken: "x" }),
      listSince: vi.fn(async () => ({ messages: [amazonMsg], nextCursor: "h9" })),
    };
    const connectorFactory = vi.fn(() => connector);
    const db = fakeDb(SOURCE, { id: "g-1", revokedAt: null });

    const handler = vi.fn(async (job: { kind: string; sourceId: string }) => {
      if (job.kind === "RESYNC") {
        await processResync(job.sourceId, { db, persister, connectorFactory });
      }
    });

    const worker = createMemoryIngestWorker(handler, { autoProcess: false });
    await worker.scheduleResync("src-1", 5);
    await worker.flush();

    expect(handler).toHaveBeenCalledOnce();
    expect(calls.insert).toHaveBeenCalledOnce();
    await worker.stop();
  });
});
