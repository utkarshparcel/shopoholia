import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_RETENTION_SCHEDULE,
  purgeExpiredIngestionDocuments,
  retentionCutoff,
  retentionCutoffFor,
  retentionDays,
  retentionDaysFor,
  retentionSchedule,
} from "./retention.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import type { StorageClient } from "./storage/r2.js";
import type { FastifyBaseLogger } from "fastify";

function stubLog(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => stubLog(),
  } as unknown as FastifyBaseLogger;
}

function stubStorage(): StorageClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async put(object) {
      return { key: object.key };
    },
    async getSignedUrl(key: string) {
      return `https://example.test/${key}`;
    },
    async delete(key: string) {
      deleted.push(key);
    },
    async deleteMany(keys: string[]) {
      deleted.push(...keys);
    },
  };
}

const RETENTION_ENV_KEYS = [
  "INGESTION_RETENTION_DAYS",
  "INGESTION_RETENTION_DAYS_EMAIL",
  "INGESTION_RETENTION_DAYS_SMS",
  "INGESTION_RETENTION_DAYS_RECEIPT",
] as const;

function clearRetentionEnv() {
  for (const key of RETENTION_ENV_KEYS) delete process.env[key];
}

describe("retention schedule", () => {
  afterEach(() => {
    clearRetentionEnv();
  });

  it("defaults to per-type schedule (EMAIL 7 / SMS 14 / RECEIPT 30)", () => {
    clearRetentionEnv();
    expect(retentionSchedule()).toEqual(DEFAULT_RETENTION_SCHEDULE);
    expect(retentionDaysFor("EMAIL")).toBe(7);
    expect(retentionDaysFor("SMS")).toBe(14);
    expect(retentionDaysFor("RECEIPT")).toBe(30);
    expect(retentionDays()).toBe(7);
  });

  it("applies global INGESTION_RETENTION_DAYS to all kinds", () => {
    clearRetentionEnv();
    process.env.INGESTION_RETENTION_DAYS = "21";
    expect(retentionDaysFor("EMAIL")).toBe(21);
    expect(retentionDaysFor("SMS")).toBe(21);
    expect(retentionDaysFor("RECEIPT")).toBe(21);
  });

  it("kind-specific env overrides global fallback", () => {
    clearRetentionEnv();
    process.env.INGESTION_RETENTION_DAYS = "30";
    process.env.INGESTION_RETENTION_DAYS_EMAIL = "3";
    process.env.INGESTION_RETENTION_DAYS_SMS = "10";
    expect(retentionDaysFor("EMAIL")).toBe(3);
    expect(retentionDaysFor("SMS")).toBe(10);
    expect(retentionDaysFor("RECEIPT")).toBe(30);
  });

  it("exposes a cutoff older than now by retentionDaysFor", () => {
    clearRetentionEnv();
    const cutoff = retentionCutoffFor("EMAIL");
    expect(cutoff.getTime()).toBeLessThan(Date.now());
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
      (retentionDaysFor("EMAIL") - 1) * 86_400_000,
    );
    expect(retentionCutoff().getTime()).toBeLessThan(Date.now());
  });
});

describe("purgeExpiredIngestionDocuments", () => {
  afterEach(() => {
    clearRetentionEnv();
  });

  it("purges old parsed documents without marking them ERROR", async () => {
    clearRetentionEnv();
    const repos = createMemoryRepositories();
    const storage = stubStorage();
    const { user } = await repos.createUser("+919999000001");

    const old = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/old.eml",
      parsedJson: { merchant: "Amazon", __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(old.id, "PARSED", null);
    const docs = await repos.listIngestionDocuments();
    const target = docs.find((d) => d.id === old.id)!;
    (target as { createdAt: Date }).createdAt = new Date(
      Date.now() - (retentionDaysFor("EMAIL") + 5) * 86_400_000,
    );

    const recent = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/recent.eml",
      parsedJson: { merchant: "Myntra", __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(recent.id, "MATCHED", null);

    const result = await purgeExpiredIngestionDocuments(repos, storage, stubLog());

    expect(result.purged).toBe(1);
    expect(result.purgedByKind.EMAIL).toBe(1);
    expect(result.schedule.EMAIL).toBe(7);
    expect(storage.deleted).toEqual(["raw/old.eml"]);

    const afterOld = await repos.getIngestionDocumentById(old.id);
    expect(afterOld).not.toBeNull();
    expect(afterOld!.status).toBe("PARSED");
    expect(afterOld!.status).not.toBe("ERROR");
    expect(afterOld!.rawKey).toBe("");
    expect(afterOld!.parsedJson.purged).toBe(true);
    // The owner lives in the user_id column, not in the purged JSON.
    expect(afterOld!.parsedJson.merchant).toBeUndefined();
    expect(afterOld!.userId).toBe(user.id);

    const afterRecent = await repos.getIngestionDocumentById(recent.id);
    expect(afterRecent!.rawKey).toBe("raw/recent.eml");
    expect(afterRecent!.status).toBe("MATCHED");
  });

  it("applies per-kind TTLs independently", async () => {
    clearRetentionEnv();
    const repos = createMemoryRepositories();
    const storage = stubStorage();
    const { user } = await repos.createUser("+919999000010");
    const now = Date.now();

    // EMAIL at 10d old → past 7d EMAIL TTL → purge
    const email = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/email.eml",
      parsedJson: { __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(email.id, "MATCHED", null);

    // SMS at 10d old → within 14d SMS TTL → keep
    const sms = await repos.createIngestionDocument({
      userId: user.id,
      kind: "SMS",
      rawKey: "raw/sms.txt",
      parsedJson: { __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(sms.id, "MATCHED", null);

    // RECEIPT at 40d old → past 30d → purge
    const receipt = await repos.createIngestionDocument({
      userId: user.id,
      kind: "RECEIPT",
      rawKey: "raw/receipt.jpg",
      parsedJson: { __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(receipt.id, "PARSED", null);

    // Mutate store rows (status updates replace Map entries — don't use stale refs).
    const rows = await repos.listIngestionDocuments();
    (rows.find((d) => d.id === email.id) as { createdAt: Date }).createdAt = new Date(
      now - 10 * 86_400_000,
    );
    (rows.find((d) => d.id === sms.id) as { createdAt: Date }).createdAt = new Date(
      now - 10 * 86_400_000,
    );
    (rows.find((d) => d.id === receipt.id) as { createdAt: Date }).createdAt = new Date(
      now - 40 * 86_400_000,
    );

    const result = await purgeExpiredIngestionDocuments(repos, storage, stubLog(), now);

    expect(result.purged).toBe(2);
    expect(result.purgedByKind).toEqual({ EMAIL: 1, SMS: 0, RECEIPT: 1 });
    expect(storage.deleted.sort()).toEqual(["raw/email.eml", "raw/receipt.jpg"]);
    expect((await repos.getIngestionDocumentById(sms.id))!.rawKey).toBe("raw/sms.txt");
    expect((await repos.getIngestionDocumentById(email.id))!.rawKey).toBe("");
    expect((await repos.getIngestionDocumentById(receipt.id))!.rawKey).toBe("");
  });

  it("purges expired documents in every status and skips already-purged ones", async () => {
    clearRetentionEnv();
    const repos = createMemoryRepositories();
    const storage = stubStorage();
    const { user } = await repos.createUser("+919999000002");

    const received = await repos.createIngestionDocument({
      userId: user.id,
      kind: "SMS",
      rawKey: "raw/received.txt",
      parsedJson: { body: "Your OTP", __userId: user.id },
    });
    (received as { createdAt: Date }).createdAt = new Date(
      Date.now() - (retentionDaysFor("SMS") + 10) * 86_400_000,
    );

    const errored = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/error.eml",
      parsedJson: {},
    });
    await repos.updateIngestionDocumentStatus(errored.id, "ERROR", "parse failed");
    const erroredFresh = (await repos.getIngestionDocumentById(errored.id))!;
    (erroredFresh as { createdAt: Date }).createdAt = new Date(
      Date.now() - (retentionDaysFor("EMAIL") + 10) * 86_400_000,
    );

    const already = await repos.createIngestionDocument({
      userId: user.id,
      kind: "EMAIL",
      rawKey: "raw/will-clear.eml",
      parsedJson: { __userId: user.id },
    });
    await repos.updateIngestionDocumentStatus(already.id, "UNMATCHED", null);
    const alreadyFresh = (await repos.getIngestionDocumentById(already.id))!;
    (alreadyFresh as { createdAt: Date }).createdAt = new Date(
      Date.now() - (retentionDaysFor("EMAIL") + 10) * 86_400_000,
    );
    await repos.purgeIngestionDocumentRaw(already.id);

    const result = await purgeExpiredIngestionDocuments(repos, storage, stubLog());
    expect(result.purged).toBe(2);
    expect(storage.deleted.sort()).toEqual(["raw/error.eml", "raw/received.txt"]);
    const receivedAfter = (await repos.getIngestionDocumentById(received.id))!;
    expect(receivedAfter.status).toBe("RECEIVED");
    expect(receivedAfter.rawKey).toBe("");
    expect(receivedAfter.parsedJson.body).toBeUndefined();
    expect((await repos.getIngestionDocumentById(errored.id))!.status).toBe("ERROR");
  });

  it("keeps the row when the storage delete fails and pages through big backlogs", async () => {
    clearRetentionEnv();
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919999000003");
    const old = new Date(Date.now() - 60 * 86_400_000);
    for (let i = 0; i < 7; i++) {
      const doc = await repos.createIngestionDocument({
        userId: user.id,
        kind: "EMAIL",
        rawKey: `raw/${i}.eml`,
        parsedJson: {},
      });
      (doc as { createdAt: Date }).createdAt = new Date(old.getTime() + i);
    }
    const deleted: string[] = [];
    const storage = {
      ...stubStorage(),
      async delete(key: string) {
        if (key === "raw/2.eml") throw new Error("R2 down");
        deleted.push(key);
      },
    };

    const result = await purgeExpiredIngestionDocuments(repos, storage, stubLog(), Date.now(), {
      batchSize: 3,
    });
    expect(result.purged).toBe(6);
    expect(result.failed).toBe(1);
    expect(deleted).toHaveLength(6);
    const left = await repos.listIngestionDocumentsForRetention("EMAIL", new Date(), 100);
    expect(left.map((d) => d.rawKey)).toEqual(["raw/2.eml"]);

    // Run twice: nothing new is purged, the failed one is retried.
    const again = await purgeExpiredIngestionDocuments(repos, storage, stubLog(), Date.now(), {
      batchSize: 3,
    });
    expect(again.purged).toBe(0);
    expect(again.failed).toBe(1);
  });
});
