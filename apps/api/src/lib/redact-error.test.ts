import { describe, expect, it } from "vitest";
import pino from "pino";
import { redactQueryError, redactQueryText } from "./redact-error.js";

/** What drizzle-orm 0.45 throws for a failed query (DrizzleQueryError), with postgres-js's error as its cause. */
function drizzleQueryError() {
  const pg = Object.assign(new Error('duplicate key value violates unique constraint "users_phone_unique"'), {
    code: "23505",
    detail: "Key (phone)=(919876543210) already exists.",
    constraint_name: "users_phone_unique",
  });
  const query = 'insert into "users" ("phone", "email") values ($1, $2)';
  const params = ["919876543210", "maya@example.com"];
  const err = new Error(`Failed query: ${query}\nparams: ${params}`) as Error & Record<string, unknown>;
  err.name = "DrizzleQueryError";
  err.query = query;
  err.params = params;
  err.cause = pg;
  return err;
}

const PII = /919876543210|maya@example\.com/;

describe("redactQueryError", () => {
  it("drops bound values from the message, the params field and the cause's detail, and keeps the SQL and code", () => {
    const redacted = redactQueryError(drizzleQueryError()) as Error & Record<string, unknown>;
    expect(redacted.message).toBe('Failed query: insert into "users" ("phone", "email") values ($1, $2)\nparams: [redacted]');
    expect(redacted.params).toBe("[redacted]");
    expect(redacted.query).toMatch(/insert into "users"/);
    const cause = redacted.cause as Record<string, unknown>;
    expect(cause.code).toBe("23505");
    expect(cause.constraint_name).toBe("users_phone_unique");
    expect(cause.detail).toBe("[redacted]");
    expect(redacted.stack).toMatch(/at /);
    expect(JSON.stringify({ ...redacted, message: redacted.message, stack: redacted.stack, cause })).not.toMatch(PII);
  });

  it("leaves ordinary errors and non-errors alone", () => {
    const plain = new Error("boom");
    expect(redactQueryError(plain)).toBe(plain);
    expect(redactQueryError("text")).toBe("text");
    expect(redactQueryText("no params here")).toBe("no params here");
  });

  it("keeps query values out of a log line written with the API's error serializer", () => {
    const lines: string[] = [];
    const log = pino(
      { serializers: { err: (e: unknown) => pino.stdSerializers.err(redactQueryError(e as Error)) } },
      { write: (line: string) => void lines.push(line) },
    );
    log.error({ err: drizzleQueryError() }, "request failed");
    expect(lines.join("")).toMatch(/Failed query/);
    expect(lines.join("")).not.toMatch(PII);
  });
});

describe("Sentry event redaction", () => {
  it("redacts query values in every exception message of an event", async () => {
    const { redactSentryEvent } = await import("./sentry.js");
    const event = redactSentryEvent({
      exception: { values: [{ value: "Failed query: select 1 where phone = $1\nparams: 919876543210" }, {}] },
    });
    expect(event.exception.values[0]!.value).toBe("Failed query: select 1 where phone = $1\nparams: [redacted]");
  });
});
