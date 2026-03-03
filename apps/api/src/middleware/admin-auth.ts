import { timingSafeEqual } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

/**
 * Fastify preHandler that gates admin endpoints behind
 * the `x-admin-key` request header.
 *
 * - In production: ADMIN_KEY is **required**. If not configured, the
 *   server refuses to start (enforced via env validation), but as a
 *   defence-in-depth we still return 501 if it’s somehow empty.
 * - If header is missing or does not match → 401 Unauthorized
 *
 * Uses constant-time `crypto.timingSafeEqual` via the `safeEqual`
 * helper to prevent timing side-channel attacks.
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

  if (!key || typeof key !== "string" || !safeEqual(key, env.ADMIN_KEY)) {
    request.log.warn(
      { reqId: request.id, path: request.url },
      "admin.auth_rejected",
    );
    reply
      .code(401)
      .send({ error: "Unauthorized", message: "Invalid or missing admin key" });
    return;
  }
}

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
