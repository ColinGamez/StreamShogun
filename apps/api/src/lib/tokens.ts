import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

// ── Access tokens ─────────────────────────────────────────────

export interface AccessPayload {
  sub: string; // userId
  email: string;
}

export function signAccessToken(
  app: FastifyInstance,
  payload: AccessPayload
): string {
  return app.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_TTL });
}

// ── Refresh tokens ────────────────────────────────────────────

/**
 * Generate a cryptographically random opaque refresh token (base64url).
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/**
 * Hash refresh token for DB storage (SHA-256).
 * We never store the raw token.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── TTL parsing ───────────────────────────────────────────────

/**
 * Convert a TTL string like "15m" or "7d" into milliseconds.
 */
export function ttlToMs(ttl: string): number {
  const match = ttl.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}

/**
 * Compute the absolute expiry date for a refresh token.
 */
export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL));
}
