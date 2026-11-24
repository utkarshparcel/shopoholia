/**
 * Keeps query values out of logs and error reports. drizzle-orm (0.44+) wraps a failed query in a
 * DrizzleQueryError whose message ends in `params: …` and which carries the bound values in
 * `params`; the Postgres error in its `cause` has a `detail` such as "Key (phone)=(9198…) already
 * exists". Any of those can be a phone number, an email or a token. The SQL text, the Postgres
 * code and the constraint stay: they are what debugging needs.
 */

const PARAMS_TAIL = /\nparams: [\s\S]*$/;

/** The message with drizzle's `params: …` tail replaced. */
export function redactQueryText(text: string): string {
  return text.replace(PARAMS_TAIL, "\nparams: [redacted]");
}

/** Fields that hold bound values (drizzle's `params`, postgres-js's `parameters` in debug mode). */
const DROPPED_KEYS = new Set(["params", "parameters", "detail", "cause"]);

type ErrorLike = Error & { params?: unknown; cause?: unknown; detail?: unknown };

function needsRedaction(error: ErrorLike): boolean {
  return (
    "params" in error ||
    "parameters" in error ||
    PARAMS_TAIL.test(error.message ?? "") ||
    (typeof error.detail === "string" && error.detail.length > 0)
  );
}

function redactCause(cause: unknown, depth: number): unknown {
  if (!cause || typeof cause !== "object" || depth > 3) return cause;
  return redactQueryError(cause, depth + 1);
}

/**
 * A copy of `error` without query values: same name, class-free, message and stack with the
 * params tail redacted, `params` and `detail` dropped, its `cause` chain treated the same way.
 * Anything that isn't such an error is returned as it is.
 */
export function redactQueryError<T>(error: T, depth = 0): T {
  if (!(error instanceof Error)) return error;
  const e = error as ErrorLike;
  const cause = redactCause(e.cause, depth);
  if (!needsRedaction(e) && cause === e.cause) return error;

  const copy = new Error(redactQueryText(e.message)) as ErrorLike;
  copy.name = e.name;
  // The stack starts with "Name: message": redact the message there, keep the frames.
  if (e.stack) copy.stack = e.stack.replace(e.message, redactQueryText(e.message));
  for (const [key, value] of Object.entries(e)) {
    if (DROPPED_KEYS.has(key)) continue;
    (copy as unknown as Record<string, unknown>)[key] = value;
  }
  if ("params" in e) (copy as unknown as Record<string, unknown>).params = "[redacted]";
  if (typeof e.detail === "string" && e.detail.length > 0) {
    (copy as unknown as Record<string, unknown>).detail = "[redacted]";
  }
  if (cause !== undefined) copy.cause = cause;
  return copy as unknown as T;
}
