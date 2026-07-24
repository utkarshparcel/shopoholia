import type { FastifyReply, FastifyRequest } from "fastify";

export type JwtPayload = {
  sub: string;
  phone: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify<JwtPayload>();
  } catch {
    return reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing token" });
  }
}
