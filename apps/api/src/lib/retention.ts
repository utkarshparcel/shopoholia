/**
 * Ingestion document retention — per data-type schedule.
 *
 * Raw `ingestion_documents` blobs (R2 `rawKey` + rich `parsedJson`) are only
 * needed until the worker parses them into merchant_purchases / items. Once the
 * kind's TTL elapses the raw blob goes whatever the status: a document stuck in
 * RECEIVED or ERROR holds the same raw mail as a parsed one. The DB row stays,
 * redacted, for metrics.
 *
 * Defaults (Limited Use / DPDP minimization):
 *   EMAIL   7d  — minimize raw mail retention (Gmail policy)
 *   SMS    14d
 *   RECEIPT 30d — user-uploaded receipt images
 *
 * Env:
 *   INGESTION_RETENTION_DAYS          — fallback for all kinds when kind-specific unset
 *   INGESTION_RETENTION_DAYS_EMAIL
 *   INGESTION_RETENTION_DAYS_SMS
 *   INGESTION_RETENTION_DAYS_RECEIPT
 *
 * Purge actions:
 * 1. R2 object at `rawKey` is deleted (if R2 is configured).
 * 2. Row keeps its status; `rawKey` cleared and PII stripped from `parsedJson`.
 *    We deliberately do NOT flip status to ERROR.
 *
 * Runs in batches (oldest first) and stops after MAX_BATCHES_PER_KIND per kind, so one run is
 * bounded; the next scheduled run continues. A storage delete that fails leaves the row as it
 * is (counted in `failed`) so the next run retries it instead of orphaning the object.
 */

import { audit } from "./audit.js";
import type { Repositories } from "./repositories/types.js";
import type { StorageClient } from "./storage/r2.js";
import type { FastifyBaseLogger } from "fastify";

export type RetentionDataType = "EMAIL" | "SMS" | "RECEIPT";

/** Per-kind defaults when no env override is set. */
export const DEFAULT_RETENTION_SCHEDULE: Record<RetentionDataType, number> = {
  EMAIL: 7,
  SMS: 14,
  RECEIPT: 30,
};

const KIND_ENV: Record<RetentionDataType, string> = {
  EMAIL: "INGESTION_RETENTION_DAYS_EMAIL",
  SMS: "INGESTION_RETENTION_DAYS_SMS",
  RECEIPT: "INGESTION_RETENTION_DAYS_RECEIPT",
};

function parsePositiveDays(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Global fallback (legacy `INGESTION_RETENTION_DAYS`). When set, it overrides
 * per-kind defaults for every kind that lacks a kind-specific env.
 * When unset, returns null so callers use DEFAULT_RETENTION_SCHEDULE.
 */
export function retentionDaysFallback(): number | null {
  return parsePositiveDays(process.env.INGESTION_RETENTION_DAYS);
}

/** @deprecated Prefer retentionDaysFor(kind). Kept for admin/compat — EMAIL default. */
export function retentionDays(): number {
  return retentionDaysFor("EMAIL");
}

export function retentionDaysFor(kind: RetentionDataType): number {
  const kindSpecific = parsePositiveDays(process.env[KIND_ENV[kind]]);
  if (kindSpecific != null) return kindSpecific;
  const fallback = retentionDaysFallback();
  if (fallback != null) return fallback;
  return DEFAULT_RETENTION_SCHEDULE[kind];
}

export function retentionSchedule(): Record<RetentionDataType, number> {
  return {
    EMAIL: retentionDaysFor("EMAIL"),
    SMS: retentionDaysFor("SMS"),
    RECEIPT: retentionDaysFor("RECEIPT"),
  };
}

export function retentionCutoffFor(kind: RetentionDataType, now = Date.now()): Date {
  const days = retentionDaysFor(kind);
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

/** @deprecated Prefer retentionCutoffFor(kind). */
export function retentionCutoff(): Date {
  return retentionCutoffFor("EMAIL");
}

export type RetentionResult = {
  checked: number;
  purged: number;
  /** ISO cutoff for the shortest schedule (most aggressive). */
  cutoff: string;
  /** EMAIL days — backward-compat for admin clients. */
  retentionDays: number;
  schedule: Record<RetentionDataType, number>;
  purgedByKind: Record<RetentionDataType, number>;
  /** Documents whose storage delete or row update failed; retried on the next run. */
  failed?: number;
};

const RETENTION_KINDS: RetentionDataType[] = ["EMAIL", "SMS", "RECEIPT"];
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCHES_PER_KIND = 25;

export async function purgeExpiredIngestionDocuments(
  repos: Repositories,
  storage: StorageClient,
  log: FastifyBaseLogger,
  now = Date.now(),
  opts: { batchSize?: number } = {},
): Promise<RetentionResult> {
  const schedule = retentionSchedule();
  const batchSize = Math.min(Math.max(opts.batchSize ?? DEFAULT_BATCH_SIZE, 1), 1000);
  const purgedByKind: Record<RetentionDataType, number> = {
    EMAIL: 0,
    SMS: 0,
    RECEIPT: 0,
  };
  let checked = 0;
  let failed = 0;

  for (const kind of RETENTION_KINDS) {
    const cutoff = retentionCutoffFor(kind, now);
    // Rows that failed stay in the result set; skip them so the loop still makes progress.
    const failedIds = new Set<string>();
    for (let batch = 0; batch < MAX_BATCHES_PER_KIND; batch++) {
      const docs = (
        await repos.listIngestionDocumentsForRetention(kind, cutoff, batchSize + failedIds.size)
      ).filter((d) => !failedIds.has(d.id));
      if (docs.length === 0) break;
      checked += docs.length;
      for (const doc of docs) {
        try {
          if (doc.rawKey) await storage.delete(doc.rawKey);
          await repos.purgeIngestionDocumentRaw(doc.id);
          purgedByKind[kind]++;
        } catch (err) {
          failed++;
          failedIds.add(doc.id);
          log.warn({ err, documentId: doc.id, kind }, "ingestion.retention.purge_failed");
        }
      }
      if (docs.length < batchSize) break;
    }
  }

  const purged = purgedByKind.EMAIL + purgedByKind.SMS + purgedByKind.RECEIPT;
  const shortestDays = Math.min(schedule.EMAIL, schedule.SMS, schedule.RECEIPT);
  const cutoff = new Date(now - shortestDays * 24 * 60 * 60 * 1000);

  if (purged > 0 || failed > 0) {
    audit(log, "ingestion.retention.purged", {
      purged,
      checked,
      failed,
      schedule,
      purgedByKind,
    });
  }

  return {
    checked,
    purged,
    cutoff: cutoff.toISOString(),
    retentionDays: schedule.EMAIL,
    schedule,
    purgedByKind,
    failed,
  };
}
