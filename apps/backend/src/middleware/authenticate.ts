// ── Auth middleware — JWT verification ─────────────────────────────────

import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify preHandler that verifies the Authorization: Bearer <token>
 * header and decorates `request.user` with the decoded payload.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}
