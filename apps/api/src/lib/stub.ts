import type { FastifyReply } from "fastify";

export function notImplemented(reply: FastifyReply, feature: string) {
  return reply.code(501).send({
    error: "Not Implemented",
    message: `${feature} is not implemented yet`,
  });
}
