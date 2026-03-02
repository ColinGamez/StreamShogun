import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

/**
 * Fastify preHandler that gates admin endpoints behind
 * the `x-admin-key` request header.
 *
 * - If ADMIN_KEY is not configured → 501 Not Implemented
 * - If header is missing or does not match → 401 Unauthorized
 */
export async function adminAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!env.ADMIN_KEY) {
    reply
      .code(501)
      .send({ error: "NotImplemented", message: "Admin API is not enabled" });
    return;
  }

  const key = request.headers["x-admin-key"];

  if (!key || key !== env.ADMIN_KEY) {
    reply
      .code(401)
      .send({ error: "Unauthorized", message: "Invalid or missing admin key" });
  }
}
