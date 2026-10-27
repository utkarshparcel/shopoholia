/**
 * Ingestion document retention — per data-type schedule.
 *
 * Raw `ingestion_documents` blobs (R2 `rawKey` + rich `parsedJson`) are only
 * needed until the worker parses them into merchant_purchases / items. After
 * PARSED / MATCHED / UNMATCHED we keep a redacted DB row for metrics and
 * delete the raw blob once the kind's TTL elapses.
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
 * 2. Row keeps parse status (PARSED/MATCHED/UNMATCHED); `rawKey` cleared and
 *    PII stripped from `parsedJson`. We deliberately do NOT flip status to ERROR.
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
};

const PURGEABLE_STATUSES = new Set(["PARSED", "MATCHED", "UNMATCHED"]);

function isRetentionKind(kind: string): kind is RetentionDataType {
  return kind === "EMAIL" || kind === "SMS" || kind === "RECEIPT";
}

export async function purgeExpiredIngestionDocuments(
  repos: Repositories,
  storage: StorageClient,
  log: FastifyBaseLogger,
  now = Date.now(),
): Promise<RetentionResult> {
  const schedule = retentionSchedule();
  const docs = await repos.listIngestionDocuments();
  const purgedByKind: Record<RetentionDataType, number> = {
    EMAIL: 0,
    SMS: 0,
    RECEIPT: 0,
  };

  // Only purge documents that have already been parsed/matched (i.e. not RECEIVED)
  // and are older than the kind's cutoff. Skip rows already stripped of raw content.
  const toPurge = docs.filter((d) => {
    if (!PURGEABLE_STATUSES.has(d.status) || !d.rawKey) return false;
    if (!isRetentionKind(d.kind)) return false;
    const cutoff = retentionCutoffFor(d.kind, now);
    return d.createdAt < cutoff;
  });

  let purged = 0;
  for (const doc of toPurge) {
    try {
      if (doc.rawKey) {
        await storage.delete(doc.rawKey).catch(() => undefined);
      }
      await repos.purgeIngestionDocumentRaw(doc.id);
      purged++;
      if (isRetentionKind(doc.kind)) purgedByKind[doc.kind]++;
    } catch {
      // per-doc failure shouldn't abort the job
    }
  }

  const shortestDays = Math.min(schedule.EMAIL, schedule.SMS, schedule.RECEIPT);
  const cutoff = new Date(now - shortestDays * 24 * 60 * 60 * 1000);

  if (purged > 0) {
    audit(log, "ingestion.retention.purged", {
      purged,
      checked: docs.length,
      schedule,
      purgedByKind,
    });
  }

  return {
    checked: docs.length,
    purged,
    cutoff: cutoff.toISOString(),
    retentionDays: schedule.EMAIL,
    schedule,
    purgedByKind,
  };
}
