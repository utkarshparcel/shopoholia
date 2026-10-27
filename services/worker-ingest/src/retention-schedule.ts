/**
 * Per-data-type retention schedule for raw ingestion blobs.
 *
 * Mirrors `apps/api/src/lib/retention.ts` so the ingest worker can decide
 * whether a document's raw payload is past TTL (any status) without
 * importing the API package. The API admin job
 * `POST /admin/ingestion/retention/purge` performs R2 + DB purge; this module
 * is the shared schedule contract for worker-side checks and tests.
 *
 * Defaults (Limited Use / DPDP minimization):
 *   EMAIL   7d
 *   SMS    14d
 *   RECEIPT 30d
 */

export type RetentionDataType = "EMAIL" | "SMS" | "RECEIPT";

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

export function retentionDaysFor(kind: RetentionDataType): number {
  const kindSpecific = parsePositiveDays(process.env[KIND_ENV[kind]]);
  if (kindSpecific != null) return kindSpecific;
  const fallback = parsePositiveDays(process.env.INGESTION_RETENTION_DAYS);
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
  return new Date(now - retentionDaysFor(kind) * 24 * 60 * 60 * 1000);
}

export function isRetentionKind(kind: string): kind is RetentionDataType {
  return kind === "EMAIL" || kind === "SMS" || kind === "RECEIPT";
}

/**
 * True when a doc's raw blob is past the kind TTL. Every status counts: a doc stuck in RECEIVED
 * or ERROR holds the same raw mail as a parsed one. `status` stays in the input for callers.
 */
export function shouldPurgeRaw(input: {
  kind: string;
  status: string;
  createdAt: Date;
  rawKey?: string | null;
  now?: number;
}): boolean {
  if (!input.rawKey) return false;
  if (!isRetentionKind(input.kind)) return false;
  return input.createdAt < retentionCutoffFor(input.kind, input.now ?? Date.now());
}
