import type { FastifyRequest, FastifyReply } from "fastify";
import { validateCsrf } from "../lib/cookies.js";

/**
 * Fastify preHandler that enforces the CSRF double-submit pattern
 * for **cookie-authenticated, mutating** requests.
 *
 * Must be registered AFTER the `authenticate` middleware so that
 * `request._authSource` is already set.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always skipped.
 * Header-based auth (desktop) is always skipped.
 */
export async function csrfGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Only enforce for cookie-based sessions
  if (request._authSource !== "cookie") return;

  // Safe methods don't mutate state — no CSRF risk
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (safeMethod) return;

  if (!validateCsrf(request)) {
    request.log.warn("CSRF validation failed");
    reply.code(403).send({ error: "Forbidden", message: "Invalid CSRF token" });
  }
}
