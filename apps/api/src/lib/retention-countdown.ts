/**
 * U045 — Per-doc retention countdown + delete-raw-now helpers.
 */

import {
  DEFAULT_RETENTION_SCHEDULE,
  retentionDaysFor,
  type RetentionDataType,
} from "./retention.js";

export type RetentionCountdown = {
  documentId: string;
  kind: RetentionDataType;
  createdAt: string;
  retentionDays: number;
  expiresAt: string;
  /** Whole days remaining (0 = expires today / overdue). */
  daysRemaining: number;
  rawPresent: boolean;
  /** Structured purchase link kept after raw delete. */
  matchedPurchaseId: string | null;
};

function isRetentionKind(kind: string): kind is RetentionDataType {
  return kind === "EMAIL" || kind === "SMS" || kind === "RECEIPT";
}

export function computeRetentionCountdown(
  doc: {
    id: string;
    kind: string;
    createdAt: Date | string;
    rawKey: string | null;
    matchedPurchaseId?: string | null;
  },
  now: Date = new Date(),
): RetentionCountdown | null {
  if (!isRetentionKind(doc.kind)) return null;
  const created = new Date(doc.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const days = retentionDaysFor(doc.kind);
  const expiresAt = new Date(created.getTime() + days * 86_400_000);
  const msLeft = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msLeft / 86_400_000));
  return {
    documentId: doc.id,
    kind: doc.kind,
    createdAt: created.toISOString(),
    retentionDays: days,
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
    rawPresent: Boolean(doc.rawKey),
    matchedPurchaseId: doc.matchedPurchaseId ?? null,
  };
}

export function listRetentionCountdowns(
  docs: Array<{
    id: string;
    kind: string;
    createdAt: Date | string;
    rawKey: string | null;
    matchedPurchaseId?: string | null;
  }>,
  now: Date = new Date(),
): RetentionCountdown[] {
  return docs
    .map((d) => computeRetentionCountdown(d, now))
    .filter((c): c is RetentionCountdown => c != null && c.rawPresent)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export { DEFAULT_RETENTION_SCHEDULE };
