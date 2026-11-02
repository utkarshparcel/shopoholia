import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Admin routes require X-Admin-Secret matching ADMIN_SECRET.
 * Fail closed when ADMIN_SECRET is unset (including production).
 * JWT alone is never sufficient.
 */
export async function requireAdminSecret(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Admin endpoints are disabled (ADMIN_SECRET not configured)",
    });
  }
  const provided = request.headers["x-admin-secret"];
  if (typeof provided !== "string" || !secretsEqual(provided, expected)) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or missing X-Admin-Secret",
    });
  }
}
