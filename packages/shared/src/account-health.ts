/**
 * Connected-account health mapping (N49-ACCT-HEALTH).
 *
 * Pure helper: turns ingestion source status + token/meta into UI-ready
 * lastSyncAt / status / error / reconnect flags. Used by API responses and
 * Closet metrics / connect-email / consent screens.
 */

import type { IngestionStatus } from "./schemas/ingestion.js";

export type AccountHealthTone =
  | "ok"
  | "syncing"
  | "paused"
  | "error"
  | "needs_reconnect";

export type AccountHealth = {
  tone: AccountHealthTone;
  label: string;
  status: IngestionStatus;
  lastSyncAt: string | null;
  error: string | null;
  needsReconnect: boolean;
  hasToken: boolean;
};

const RECONNECT_ERROR_CODES = new Set([
  "DISCONNECTED",
  "TOKEN_REVOKED",
  "INVALID_GRANT",
  "NO_TOKEN",
  "AUTH_FAILED",
]);

function asStatus(value: string): IngestionStatus {
  if (
    value === "IDLE" ||
    value === "SYNCING" ||
    value === "PAUSED" ||
    value === "ERROR"
  ) {
    return value;
  }
  return "ERROR";
}

function readMetaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Map source status / token presence / meta.lastError into a health row.
 *
 * Reconnect is offered when the token is missing, status is ERROR, or meta
 * carries an auth/disconnect error code — i.e. whenever inbox magic fails.
 */
export function mapAccountHealth(input: {
  status: string;
  lastSyncAt: string | null;
  hasToken: boolean;
  meta?: Record<string, unknown> | null;
}): AccountHealth {
  const status = asStatus(input.status);
  const lastSyncAt = input.lastSyncAt;
  const hasToken = Boolean(input.hasToken);
  const meta = input.meta ?? null;
  const errorCode = readMetaString(meta, "errorCode");
  const lastError = readMetaString(meta, "lastError");

  let error: string | null = lastError;
  if (!error && !hasToken) {
    error = "No access token — reconnect required";
  } else if (!error && status === "ERROR") {
    error = "Sync failed — reconnect to resume";
  }

  if (status === "SYNCING") {
    return {
      tone: "syncing",
      label: "Syncing",
      status,
      lastSyncAt,
      error: null,
      needsReconnect: false,
      hasToken,
    };
  }

  if (status === "PAUSED") {
    return {
      tone: "paused",
      label: "Paused",
      status,
      lastSyncAt,
      error: null,
      needsReconnect: false,
      hasToken,
    };
  }

  const needsReconnect =
    status === "ERROR" ||
    !hasToken ||
    (errorCode != null && RECONNECT_ERROR_CODES.has(errorCode));

  if (needsReconnect) {
    return {
      tone: "needs_reconnect",
      label: "Reconnect needed",
      status,
      lastSyncAt,
      error,
      needsReconnect: true,
      hasToken,
    };
  }

  // IDLE with token: healthy (or waiting on first sync).
  return {
    tone: "ok",
    label: lastSyncAt ? "Healthy" : "Connected · waiting for first sync",
    status,
    lastSyncAt,
    error: null,
    needsReconnect: false,
    hasToken,
  };
}
