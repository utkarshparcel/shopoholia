/**
 * Node/BullMQ Sentry bootstrap for Closet workers (+ reusable by API).
 * Subpath-only (`@worn/shared/node-sentry`) so mobile never pulls `@sentry/node`.
 */
import * as Sentry from "@sentry/node";
import {
  sentrySmokeMessage,
  wornSentryTags,
  type WornSurface,
} from "./observability.js";

let initialized = false;
let surface: WornSurface = "api";
let workerName: string | undefined;

export type InitNodeSentryOptions = {
  surface?: "api" | "worker";
  worker?: string;
  /** Capture a smoke message when SENTRY_SMOKE=1. */
  smoke?: boolean;
};

/** Env-gated Sentry init — no-op without SENTRY_DSN. Idempotent. */
export function initNodeSentry(options: InitNodeSentryOptions = {}): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return false;

  surface = options.surface ?? (options.worker ? "worker" : "api");
  workerName = options.worker;

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV ?? "development",
    initialScope: {
      tags: wornSentryTags({
        surface,
        worker: options.worker,
      }),
    },
  });
  initialized = true;

  const wantSmoke = options.smoke ?? process.env.SENTRY_SMOKE === "1";
  if (wantSmoke) {
    Sentry.captureMessage(
      sentrySmokeMessage(surface, options.worker),
      "info",
    );
  }
  return true;
}

export function captureNodeException(
  error: unknown,
  extraTags?: Record<string, string>,
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    scope.setTags({
      ...wornSentryTags({ surface, worker: workerName }),
      ...(extraTags ?? {}),
    });
    Sentry.captureException(error);
  });
}

/** Attach BullMQ `failed` → Sentry. Safe if Sentry was never initialized. */
export function attachBullmqFailureReporting(
  worker: {
    on: (
      event: "failed",
      listener: (job: { id?: string } | undefined, err: Error) => void,
    ) => void;
  },
  name: string,
): void {
  worker.on("failed", (job, err) => {
    captureNodeException(err, {
      worker: name,
      job_id: job?.id != null ? String(job.id) : "unknown",
    });
  });
}

/** Test helper — clears init flag (does not close Sentry client). */
export function resetNodeSentryForTests(): void {
  initialized = false;
  surface = "api";
  workerName = undefined;
}
