import { mapLimit, PrivacyEraseJobSchema } from "@worn/shared";
import type { FastifyBaseLogger } from "fastify";
import { audit } from "../lib/audit.js";
import type { AppDeps } from "../lib/deps.js";
import type { enqueueJob } from "../lib/queues/enqueue.js";
import { disconnectEmailSources } from "./gmail-token-revoke.js";

export type PrivacyEraseDeps = Pick<AppDeps, "repos" | "storage"> & {
  log: FastifyBaseLogger;
  enqueue?: typeof enqueueJob;
};

const STORAGE_DELETE_CONCURRENCY = 8;
const MAX_ERROR_LENGTH = 500;

/**
 * DELETE /vault, off the request path. Steps, each recorded in `privacy_requests.steps` so a
 * retry resumes where the last run stopped (safe to run twice):
 * 1. Stop Gmail processing: queue the token revokes, clear the tokens.
 * 2. Collect every storage key the user's rows point at into `storage_keys` (the outbox), then
 *    delete the rows in one transaction (consent and audit rows stay with user_id nulled).
 * 3. Delete each stored object. Keys that fail stay in the outbox and the job throws, so BullMQ
 *    retries only what is left.
 * 4. DONE: the request row drops its user id; its subject_ref stays as proof.
 */
export async function privacyErase(data: unknown, deps: PrivacyEraseDeps): Promise<void> {
  const { requestId } = PrivacyEraseJobSchema.parse(data);
  const { repos, storage, log } = deps;
  const request = await repos.getPrivacyRequest(requestId);
  if (!request || request.kind !== "ERASE") {
    throw new Error(`privacy-erase: no ERASE request ${requestId}`);
  }
  if (request.status === "DONE") return;

  const steps: Record<string, unknown> = { ...request.steps };
  let storageKeys = [...request.storageKeys];
  await repos.updatePrivacyRequest(requestId, {
    status: "RUNNING",
    attempts: request.attempts + 1,
    error: null,
  });

  try {
    const userId = request.userId;
    if (userId && !steps.rowsDeleted) {
      if (steps.tokensRevoked === undefined) {
        const revoked = await disconnectEmailSources(repos, userId, deps.enqueue);
        steps.tokensRevoked = revoked.revokesQueued;
        if (revoked.revokesSkipped > 0) steps.tokenRevokesSkipped = revoked.revokesSkipped;
        await repos.updatePrivacyRequest(requestId, { steps });
      }
      // Collected right before the delete so objects added since an earlier attempt are included.
      const keys = await repos.listUserStorageKeys(userId);
      storageKeys = [...new Set([...storageKeys, ...keys])];
      steps.keysCollected = storageKeys.length;
      await repos.updatePrivacyRequest(requestId, { storageKeys, steps });

      await repos.deleteAllUserData(userId);
      steps.rowsDeleted = true;
      await repos.updatePrivacyRequest(requestId, { steps });
    }

    if (storageKeys.length > 0) {
      const failed: string[] = [];
      await mapLimit(storageKeys, STORAGE_DELETE_CONCURRENCY, async (key) => {
        try {
          await storage.delete(key);
        } catch (err) {
          failed.push(key);
          log.warn({ err, requestId }, "privacy.erase.storage_delete_failed");
        }
      });
      steps.objectsDeleted = (Number(steps.objectsDeleted) || 0) + storageKeys.length - failed.length;
      storageKeys = failed;
      await repos.updatePrivacyRequest(requestId, { storageKeys, steps });
      if (failed.length > 0) {
        throw new Error(`privacy-erase: ${failed.length} stored objects not deleted yet`);
      }
    }

    await repos.updatePrivacyRequest(requestId, {
      status: "DONE",
      userId: null,
      storageKeys: [],
      steps,
      error: null,
      completedAt: new Date(),
    });
    audit(log, "privacy.erase.completed", { requestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repos
      .updatePrivacyRequest(requestId, { error: message.slice(0, MAX_ERROR_LENGTH) })
      .catch((updateErr) => log.error({ err: updateErr, requestId }, "privacy.erase.error_not_saved"));
    throw err;
  }
}

/**
 * For the worker once the queue has given up on a privacy-erase or privacy-export job: store
 * FAILED so the request is no longer open (open-request index) and a new DELETE /vault or
 * POST /vault/export makes a new request with a new job id. A no-op once the request is DONE.
 */
export async function failPrivacyRequestJob(
  data: unknown,
  deps: Pick<AppDeps, "repos">,
  error: string,
): Promise<void> {
  const { requestId } = PrivacyEraseJobSchema.parse(data);
  const request = await deps.repos.getPrivacyRequest(requestId);
  if (!request || request.status === "DONE") return;
  await deps.repos.updatePrivacyRequest(requestId, {
    status: "FAILED",
    error: error.slice(0, MAX_ERROR_LENGTH),
  });
}
