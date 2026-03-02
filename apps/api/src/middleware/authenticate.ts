import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify preHandler hook that verifies the JWT access token.
 * On success, `request.user` is populated with `{ sub, email }`.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    request.log.debug({ err: (err as Error).message }, "JWT verification failed");
    reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}
