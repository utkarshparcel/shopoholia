import { createHash } from "node:crypto";
import { GMAIL_TOKEN_REVOKE_QUEUE, GmailTokenRevokeJobSchema } from "@worn/shared";
import { enqueueJob, jobIdFrom } from "../lib/queues/enqueue.js";
import type { Repositories } from "../lib/repositories/types.js";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REVOKE_TIMEOUT_MS = 10_000;

export type GmailTokenRevokeDeps = {
  /**
   * Decrypts an `ingestion_sources.encrypted_token` blob (AES-256-GCM, OAUTH_TOKEN_SECRET).
   * The worker passes `decryptToken` from @worn/shared/token-crypto.
   */
  decryptToken: (blob: string) => unknown;
  fetch?: typeof fetch;
};

/**
 * Revokes a Gmail grant at Google. Safe to run twice: Google answers 400 `invalid_token` for a
 * token that is already revoked or expired, which counts as done. Any other answer throws so
 * BullMQ retries and, after the last attempt, dead-letters the job.
 */
export async function gmailTokenRevoke(data: unknown, deps: GmailTokenRevokeDeps): Promise<void> {
  const { sourceId, encryptedToken } = GmailTokenRevokeJobSchema.parse(data);
  const token = deps.decryptToken(encryptedToken) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  // Revoking the refresh token also revokes the access tokens minted from it.
  const value =
    typeof token?.refreshToken === "string" && token.refreshToken
      ? token.refreshToken
      : typeof token?.accessToken === "string" && token.accessToken
        ? token.accessToken
        : null;
  if (!value) throw new Error(`gmail-token-revoke: source ${sourceId} token has nothing to revoke`);

  const res = await (deps.fetch ?? fetch)(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: value }).toString(),
    signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
  });
  if (res.ok) return;
  if (res.status === 400) {
    const body = await res.text().catch(() => "");
    if (body.includes("invalid_token")) return;
  }
  throw new Error(`gmail-token-revoke: Google answered ${res.status} for source ${sourceId}`);
}

/** Job id for one token: a reconnected source gets a new token and so a new job. */
function revokeJobId(sourceId: string, blob: string): string {
  return jobIdFrom("gmail-revoke", sourceId, createHash("sha256").update(blob).digest("hex").slice(0, 16));
}

/** Queues the Google revoke for one stored token (deterministic job id, 5 attempts). */
export function enqueueGmailTokenRevoke(
  sourceId: string,
  blob: string,
  enqueue: typeof enqueueJob = enqueueJob,
) {
  return enqueue(
    GMAIL_TOKEN_REVOKE_QUEUE,
    "revoke",
    { sourceId, encryptedToken: blob },
    { jobId: revokeJobId(sourceId, blob), attempts: 5 },
  );
}

/**
 * Stops Gmail processing for a user: queues a revoke for every stored token, then clears the
 * tokens and disconnects the sources. Revokes are queued before the tokens are cleared (with
 * deterministic job ids), so a crash in between never leaves a token cleared but not revoked.
 */
export async function disconnectEmailSources(
  repos: Repositories,
  userId: string,
  enqueue: typeof enqueueJob = enqueueJob,
): Promise<{ disconnected: number; revokesQueued: number; revokesSkipped: number }> {
  const handled = new Set<string>();
  let revokesQueued = 0;
  let revokesSkipped = 0;
  const queue = async (sourceId: string, blob: string) => {
    if (handled.has(sourceId)) return;
    handled.add(sourceId);
    const result = await enqueueGmailTokenRevoke(sourceId, blob, enqueue);
    if (result.status === "queued") revokesQueued++;
    else revokesSkipped++;
  };

  const sources = await repos.listIngestionSources(userId);
  for (const s of sources) {
    if (s.kind === "EMAIL" && s.encryptedToken?.data) await queue(s.id, s.encryptedToken.data);
  }
  const cleared = await repos.disconnectIngestionSourcesByKind(userId, "EMAIL");
  // A source connected between the list and the update.
  for (const c of cleared) {
    if (c.encryptedToken?.data) await queue(c.id, c.encryptedToken.data);
  }
  return { disconnected: cleared.length, revokesQueued, revokesSkipped };
}
