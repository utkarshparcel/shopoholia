import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import * as z3 from "zod/v3";
import { installZod3Messages } from "./zod-messages.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- one builder runs against both zod APIs */
type Zod = any;

/**
 * Each case builds the same schema with zod 3 (`zod/v3`, the old implementation zod 4 still
 * ships) and zod 4, parses the same input, and expects the same issue paths and messages.
 */
const cases: Array<[name: string, build: (zz: Zod) => any, input: unknown]> = [
  ["missing key", (zz) => zz.object({ phone: zz.string() }), {}],
  ["wrong type", (zz) => zz.object({ phone: zz.string() }), { phone: 919876543210 }],
  ["null for object", (zz) => zz.object({ a: zz.string() }), null],
  ["array for object", (zz) => zz.object({ a: zz.string() }), []],
  ["string for array", (zz) => zz.object({ a: zz.array(zz.string()) }), { a: "x" }],
  ["string for boolean", (zz) => zz.object({ a: zz.boolean() }), { a: "true" }],
  ["string too short", (zz) => zz.object({ code: zz.string().min(6) }), { code: "12" }],
  ["string too long", (zz) => zz.object({ code: zz.string().max(2) }), { code: "123" }],
  ["string exact length", (zz) => zz.object({ code: zz.string().length(4) }), { code: "12" }],
  ["array too short", (zz) => zz.object({ a: zz.array(zz.number()).min(1) }), { a: [] }],
  ["array too long", (zz) => zz.object({ a: zz.array(zz.number()).max(1) }), { a: [1, 2] }],
  ["number min", (zz) => zz.object({ n: zz.number().min(1) }), { n: 0 }],
  ["number max", (zz) => zz.object({ n: zz.number().max(10) }), { n: 11 }],
  ["positive", (zz) => zz.object({ n: zz.number().positive() }), { n: 0 }],
  ["nonnegative", (zz) => zz.object({ n: zz.number().int().nonnegative() }), { n: -1 }],
  ["lt", (zz) => zz.object({ n: zz.number().lt(5) }), { n: 5 }],
  ["int", (zz) => zz.object({ n: zz.number().int() }), { n: 1.5 }],
  ["NaN", (zz) => zz.object({ n: zz.number() }), { n: Number.NaN }],
  ["multipleOf", (zz) => zz.object({ n: zz.number().multipleOf(5) }), { n: 7 }],
  ["coerced NaN", (zz) => zz.object({ limit: zz.coerce.number().int() }), { limit: "abc" }],
  ["uuid", (zz) => zz.object({ id: zz.string().uuid() }), { id: "not-a-uuid" }],
  ["url", (zz) => zz.object({ u: zz.string().url() }), { u: "nope" }],
  ["email", (zz) => zz.object({ e: zz.string().email() }), { e: "nope" }],
  ["datetime", (zz) => zz.object({ t: zz.string().datetime() }), { t: "2024-01-01" }],
  ["date", (zz) => zz.object({ d: zz.string().date() }), { d: "2024-02-30" }],
  ["regex default", (zz) => zz.object({ s: zz.string().regex(/^a$/) }), { s: "b" }],
  ["regex message", (zz) => zz.object({ s: zz.string().regex(/^a$/, "Expected HH:mm") }), { s: "b" }],
  ["startsWith", (zz) => zz.object({ s: zz.string().startsWith("ab") }), { s: "x" }],
  ["endsWith", (zz) => zz.object({ s: zz.string().endsWith("ab") }), { s: "x" }],
  ["includes", (zz) => zz.object({ s: zz.string().includes("ab") }), { s: "x" }],
  ["enum value", (zz) => zz.object({ r: zz.enum(["A", "B"]) }), { r: "C" }],
  ["enum missing", (zz) => zz.object({ r: zz.enum(["A", "B"]) }), {}],
  ["enum non-string", (zz) => zz.object({ r: zz.enum(["A", "B"]) }), { r: 1 }],
  ["literal", (zz) => zz.object({ k: zz.literal("x") }), { k: "y" }],
  ["literal missing", (zz) => zz.object({ k: zz.literal(true) }), {}],
  ["union", (zz) => zz.object({ u: zz.union([zz.literal("a"), zz.number()]) }), { u: "b" }],
  ["strict", (zz) => zz.object({ a: zz.string() }).strict(), { a: "x", b: 1, c: 2 }],
  ["refine default", (zz) => zz.object({ a: zz.string().refine((s: string) => s === "x") }), { a: "y" }],
  ["refine message", (zz) => zz.object({ a: zz.string().refine((s: string) => s === "x", "Must be x") }), { a: "y" }],
  ["custom min message", (zz) => zz.object({ a: zz.string().min(2, "Too short") }), { a: "y" }],
  [
    "superRefine",
    (zz) =>
      zz.object({ a: zz.number() }).superRefine((v: { a: number }, ctx: any) => {
        if (v.a > 1) ctx.addIssue({ code: "custom", message: "Too many", path: ["a"] });
      }),
    { a: 2 },
  ],
  ["record value", (zz) => zz.object({ r: zz.record(zz.string(), zz.number()) }), { r: { a: "x" } }],
  ["record key", (zz) => zz.object({ r: zz.record(zz.string().uuid(), zz.number()) }), { r: { k: 1 } }],
  ["nullable", (zz) => zz.object({ a: zz.string().nullable() }), { a: 1 }],
  ["optional wrong type", (zz) => zz.object({ a: zz.string().optional() }), { a: 1 }],
  [
    "several issues in order",
    (zz) => zz.object({ phone: zz.string().min(10), code: zz.string().length(6), n: zz.number().int().min(1) }),
    { code: 123456, n: 0 },
  ],
  ["nested path", (zz) => zz.object({ items: zz.array(zz.object({ id: zz.string().uuid() })) }), { items: [{ id: "x" }] }],
];
/* eslint-enable @typescript-eslint/no-explicit-any */

function issuesOf(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => ({ path: issue.path.map(String).join("/"), message: issue.message }));
}

describe("zod 3 messages under zod 4", () => {
  beforeAll(() => {
    installZod3Messages();
  });

  it.each(cases)("%s", (_name, build, input) => {
    const before = issuesOf(build(z3.z).safeParse(input));
    const after = issuesOf(build(z).safeParse(input));
    expect(after).toEqual(before);
  });

  it("leaves a schema's own error option alone", () => {
    const result = z.object({ a: z.string({ error: "Name it" }) }).safeParse({});
    expect(issuesOf(result)).toEqual([{ path: "a", message: "Name it" }]);
  });

  it("says Infinity is not finite, as zod 3 did with .finite()", () => {
    const before = issuesOf(z3.z.object({ n: z3.z.number().finite() }).safeParse({ n: Infinity }));
    const after = issuesOf(z.object({ n: z.number() }).safeParse({ n: Infinity }));
    expect(after).toEqual(before);
  });
});
