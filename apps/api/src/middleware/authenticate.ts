import type { FastifyRequest, FastifyReply } from "fastify";
import { parseCookies, COOKIE_ACCESS_TOKEN } from "../lib/cookies.js";

/**
 * Fastify preHandler hook that verifies the JWT access token.
 *
 * Authentication is attempted in order:
 *   1. Authorization: Bearer <token>  (desktop / API clients)
 *   2. access_token cookie            (web browser clients)
 *
 * On success `request.user` is populated with `{ sub, email }`.
 * The source is tagged on `request._authSource` for downstream use
 * (e.g. CSRF enforcement on cookie-based sessions).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // ── 1. Try Authorization header (desktop flow) ─────────────
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      await request.jwtVerify();
      request._authSource = "header";
      return;
    } catch {
      // Header was present but invalid — fall through to cookie
    }
  }

  // ── 2. Try httpOnly access_token cookie (web flow) ─────────
  const cookies = parseCookies(request.headers.cookie);
  const cookieToken = cookies[COOKIE_ACCESS_TOKEN];
  if (cookieToken) {
    try {
      const payload = request.server.jwt.verify<{ sub: string; email: string }>(cookieToken);
      request.user = payload;
      request._authSource = "cookie";
      return;
    } catch {
      // Cookie token expired or invalid
    }
  }

  request.log.debug("No valid credentials in header or cookie");
  reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token" });
}
