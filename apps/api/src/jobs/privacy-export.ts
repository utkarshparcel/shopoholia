import { PrivacyExportJobSchema } from "@worn/shared";
import type { FastifyBaseLogger } from "fastify";
import { audit } from "../lib/audit.js";
import type { AppDeps } from "../lib/deps.js";
import { userObjectKey } from "../lib/storage/r2.js";

export type PrivacyExportDeps = Pick<AppDeps, "repos" | "storage"> & { log: FastifyBaseLogger };

/** Rows per table in one export file; a table over the cap is listed in `truncated`. */
export const EXPORT_MAX_ROWS_PER_TABLE = 10_000;
const MAX_ERROR_LENGTH = 500;

/**
 * POST /vault/export, off the request path: every row of every user table (user-data-tables.ts)
 * as one JSON file at `u/{userId}/exports/{requestId}.json`. Safe to run twice: the key is fixed
 * per request, so a rerun overwrites the same object, and a DONE request is left alone.
 * The retention sweep deletes the file after 7 days.
 */
export async function privacyExport(data: unknown, deps: PrivacyExportDeps): Promise<void> {
  const { requestId } = PrivacyExportJobSchema.parse(data);
  const { repos, storage, log } = deps;
  const request = await repos.getPrivacyRequest(requestId);
  if (!request || request.kind !== "EXPORT") {
    throw new Error(`privacy-export: no EXPORT request ${requestId}`);
  }
  if (request.status === "DONE") return;
  const userId = request.userId;
  if (!userId) throw new Error(`privacy-export: request ${requestId} has no user (erased)`);

  await repos.updatePrivacyRequest(requestId, {
    status: "RUNNING",
    attempts: request.attempts + 1,
    error: null,
  });
  try {
    const { tables, truncated } = await repos.exportUserTables(userId, EXPORT_MAX_ROWS_PER_TABLE);
    const key = userObjectKey(userId, "exports", `${requestId}.json`);
    const body = Buffer.from(
      JSON.stringify({ generatedAt: new Date().toISOString(), requestId, truncated, tables }),
      "utf8",
    );
    await storage.put({ key, body, contentType: "application/json" });
    await repos.updatePrivacyRequest(requestId, {
      status: "DONE",
      resultKey: key,
      steps: { ...request.steps, tables: Object.keys(tables).length, truncated: truncated.length },
      error: null,
      completedAt: new Date(),
    });
    audit(log, "privacy.export.completed", { userId, requestId, tables: Object.keys(tables).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repos
      .updatePrivacyRequest(requestId, { error: message.slice(0, MAX_ERROR_LENGTH) })
      .catch((updateErr) => log.error({ err: updateErr, requestId }, "privacy.export.error_not_saved"));
    throw err;
  }
}
