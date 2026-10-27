import type { FastifyReply, FastifyRequest } from "fastify";
import type { ConsentScope } from "@worn/shared";

export async function requireConsentHandler(
  scope: ConsentScope,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user?.sub;
  if (!userId) {
    return reply
      .code(401)
      .send({ error: "Unauthorized", message: "Invalid or missing token" });
  }

  const granted = await request.server.deps.repos.findActiveConsent(userId, scope);
  if (!granted) {
    return reply.code(403).send({
      error: "Forbidden",
      message: `Missing active consent for scope: ${scope}`,
    });
  }
}

/** preHandler factory: 403 unless the user holds a live (non-revoked) grant. */
export function requireConsent(scope: ConsentScope) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    return requireConsentHandler(scope, request, reply);
  };
}
