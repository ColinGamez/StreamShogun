import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

/**
 * Fastify preHandler that gates admin endpoints behind
 * the `x-admin-key` request header.
 *
 * - In production: ADMIN_KEY is **required**. If not configured, the
 *   server refuses to start (enforced via env validation), but as a
 *   defence-in-depth we still return 501 if it's somehow empty.
 * - If header is missing or does not match → 401 Unauthorized
 *
 * Timing-safe comparison is intentionally omitted because the key is
 * a static opaque secret (not HMAC); we rely on rate-limiting + TLS
 * instead.  If you want constant-time comparison, swap to
 * `crypto.timingSafeEqual` here.
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
    request.log.warn(
      { reqId: request.id, path: request.url },
      "admin.auth_rejected",
    );
    reply
      .code(401)
      .send({ error: "Unauthorized", message: "Invalid or missing admin key" });
  }
}
