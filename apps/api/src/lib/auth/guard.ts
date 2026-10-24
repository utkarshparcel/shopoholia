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

/** For routes that work signed out: the caller's user id, or null for a missing or bad token. */
export async function optionalUserId(request: FastifyRequest): Promise<string | null> {
  if (!request.headers.authorization) return null;
  try {
    const payload = await request.jwtVerify<JwtPayload>();
    return payload.sub;
  } catch {
    return null;
  }
}
