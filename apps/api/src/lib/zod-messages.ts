import { z } from "zod";

/**
 * zod 3's English messages for zod 4 issues.
 *
 * A request that fails its schema gets Fastify's 400, whose `message` is built from the issue
 * messages ("body/phone Required, body/code String must contain at least 6 character(s)"). zod 4
 * words its defaults differently ("Invalid input: expected string, received undefined"); this map
 * keeps the API's validation responses as they were before the upgrade. Messages a schema sets
 * itself (`.min(1, "…")`, `{ error: "…" }`, `ctx.addIssue({ message })`) still win: zod consults
 * the global map only for an issue with no message of its own. Codes zod 3 had no wording for
 * fall through to zod's own locale.
 */

type RawIssue = Parameters<z.core.$ZodErrorMap>[0];

/** zod 3's `getParsedType`, which named the received type in "Expected X, received Y". */
function parsedType(input: unknown): string {
  switch (typeof input) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(input) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    default:
      if (Array.isArray(input)) return "array";
      if (input === null) return "null";
      if (
        typeof (input as { then?: unknown }).then === "function" &&
        typeof (input as { catch?: unknown }).catch === "function"
      ) {
        return "promise";
      }
      if (typeof Map !== "undefined" && input instanceof Map) return "map";
      if (typeof Set !== "undefined" && input instanceof Set) return "set";
      if (typeof Date !== "undefined" && input instanceof Date) return "date";
      return "object";
  }
}

/** zod 3's `util.joinValues`: strings quoted, joined with " | ". */
function joinValues(values: readonly unknown[], separator = " | "): string {
  return values.map((value) => (typeof value === "string" ? `'${value}'` : String(value))).join(separator);
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** zod 4 names some expected types differently. */
const EXPECTED_V3: Record<string, string> = { tuple: "array", record: "object" };

function invalidType(issue: Extract<RawIssue, { code: "invalid_type" }>): string | undefined {
  const { input, expected } = issue;
  if (input === undefined) return "Required";
  // zod 3 reported a non-integer for `.int()` as a type error with these exact names.
  if (expected === "int") return "Expected integer, received float";
  if (expected === "date" && input instanceof Date) return "Invalid date";
  if (expected === "number" && typeof input === "number" && !Number.isNaN(input)) {
    // zod 4 refuses ±Infinity in every number schema; zod 3 only with `.finite()`.
    return "Number must be finite";
  }
  if (expected === "nonoptional") return undefined;
  return `Expected ${EXPECTED_V3[expected] ?? expected}, received ${parsedType(input)}`;
}

function invalidValue(issue: Extract<RawIssue, { code: "invalid_value" }>): string | undefined {
  const type = (issue.inst as { _zod?: { def?: { type?: string } } } | undefined)?._zod?.def?.type;
  if (type === "literal") {
    return `Invalid literal value, expected ${JSON.stringify(issue.values[0], bigintSafe)}`;
  }
  if (type === "enum") {
    // zod 3 checked that an enum value is a string before looking it up.
    if (issue.input === undefined) return "Required";
    if (typeof issue.input !== "string") {
      return `Expected ${joinValues(issue.values)}, received ${parsedType(issue.input)}`;
    }
    return `Invalid enum value. Expected ${joinValues(issue.values)}, received '${issue.input}'`;
  }
  return undefined;
}

function invalidFormat(issue: Extract<RawIssue, { code: "invalid_format" }>): string {
  switch (issue.format) {
    case "regex":
      return "Invalid";
    case "starts_with":
      return `Invalid input: must start with "${(issue as { prefix?: string }).prefix}"`;
    case "ends_with":
      return `Invalid input: must end with "${(issue as { suffix?: string }).suffix}"`;
    case "includes":
      return `Invalid input: must include "${(issue as { includes?: string }).includes}"`;
    case "guid":
      return "Invalid uuid";
    default:
      return `Invalid ${issue.format}`;
  }
}

function sizeOrigin(origin: string): string {
  return origin === "int" ? "number" : origin;
}

function tooSmall(issue: Extract<RawIssue, { code: "too_small" }>): string {
  const { exact, inclusive, minimum } = issue;
  switch (sizeOrigin(issue.origin)) {
    case "array":
      return `Array must contain ${exact ? "exactly" : inclusive ? "at least" : "more than"} ${minimum} element(s)`;
    case "string":
      return `String must contain ${exact ? "exactly" : inclusive ? "at least" : "over"} ${minimum} character(s)`;
    case "number":
    case "bigint":
      return `Number must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${minimum}`;
    case "date":
      return `Date must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(minimum))}`;
    default:
      return "Invalid input";
  }
}

function tooBig(issue: Extract<RawIssue, { code: "too_big" }>): string {
  const { exact, inclusive, maximum } = issue;
  switch (sizeOrigin(issue.origin)) {
    case "array":
      return `Array must contain ${exact ? "exactly" : inclusive ? "at most" : "less than"} ${maximum} element(s)`;
    case "string":
      return `String must contain ${exact ? "exactly" : inclusive ? "at most" : "under"} ${maximum} character(s)`;
    case "number":
      return `Number must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
    case "bigint":
      return `BigInt must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
    case "date":
      return `Date must be ${exact ? "exactly" : inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(maximum))}`;
    default:
      return "Invalid input";
  }
}

export const zod3Messages: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      return invalidType(issue);
    case "invalid_value":
      return invalidValue(issue);
    case "invalid_format":
      return invalidFormat(issue);
    case "too_small":
      return tooSmall(issue);
    case "too_big":
      return tooBig(issue);
    case "not_multiple_of":
      return `Number must be a multiple of ${issue.divisor}`;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${joinValues(issue.keys, ", ")}`;
    case "invalid_union":
    case "custom":
      return "Invalid input";
    // zod 3 reported a bad record key with the key schema's own message.
    case "invalid_key":
    case "invalid_element":
      return issue.issues[0]?.message;
    default:
      return undefined;
  }
};

/** Installs {@link zod3Messages} as zod's global error map (process wide, idempotent). */
export function installZod3Messages(): void {
  z.config({ customError: zod3Messages });
}
