/**
 * CONCIERGE-OPS — authorize operator actions on a consented user's closet.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

/** Returns true when the target user has live CONCIERGE consent; else 403. */
export async function requireConciergeConsentForUser(
  request: FastifyRequest,
  reply: FastifyReply,
  targetUserId: string,
): Promise<boolean> {
  const grant = await request.server.deps.repos.findActiveConsent(
    targetUserId,
    "CONCIERGE",
  );
  if (!grant) {
    await reply.code(403).send({
      error: "Forbidden",
      message: "Missing active CONCIERGE consent for target user",
    });
    return false;
  }
  return true;
}
