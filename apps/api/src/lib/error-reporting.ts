import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { logJobError, type JobErrorReporter } from "./jobs/queue.js";
import { captureException } from "./sentry.js";

/** The status Fastify's default error handler answers with (mirrors fastify/lib/error-status.js). */
export function errorStatusCode(
  error: Pick<FastifyError, "statusCode">,
  reply: Pick<FastifyReply, "statusCode">,
): number {
  // A status the handler set before failing wins.
  if (reply.statusCode !== 200) return reply.statusCode;
  const status = Number(error.statusCode || (error as { status?: unknown }).status);
  return status >= 400 && status < 600 ? status : 500;
}

/**
 * onError hook: sends unexpected errors (5xx, including errors with no HTTP status) to
 * Sentry. Expected 4xx errors (validation, bad JSON, payload too large…) are skipped.
 * It only observes; Fastify's error handler still builds the response.
 */
export async function reportRequestError(
  request: Pick<FastifyRequest, "id" | "method" | "routeOptions">,
  reply: Pick<FastifyReply, "statusCode">,
  error: FastifyError,
): Promise<void> {
  const status = errorStatusCode(error, reply);
  if (status >= 400 && status < 500) return;
  captureException(error, {
    tags: {
      request_id: request.id,
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      status_code: String(status),
    },
    unhandled: true,
  });
}

/** Failed background jobs: logged, and sent to Sentry tagged with the job's kind and ids. */
export const reportJobError: JobErrorReporter = (error, job) => {
  logJobError(error, job);
  captureException(error, { tags: { job: job.kind, ...job.ids } });
};
