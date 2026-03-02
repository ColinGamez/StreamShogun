// ── JWT token utilities ────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { env } from "../config/index.js";

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // refresh token id
}

/** Sign a short-lived access token. */
export function signAccessToken(app: FastifyInstance, payload: AccessTokenPayload): string {
  return app.jwt.sign(payload, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
}

/** Sign a long-lived refresh token and persist it in the DB. */
export async function signRefreshToken(
  app: FastifyInstance,
  userId: string,
): Promise<string> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId,
      token: jti,
      expiresAt,
    },
  });

  return app.jwt.sign(
    { sub: userId, jti } satisfies RefreshTokenPayload,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  );
}

/** Revoke a specific refresh token. */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { id: jti },
    data: { revoked: true },
  });
}

/** Revoke all refresh tokens for a user. */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { revoked: true },
  });
}

/** Validate a refresh token jti against the DB. */
export async function validateRefreshToken(jti: string): Promise<boolean> {
  const token = await prisma.refreshToken.findUnique({ where: { id: jti } });
  if (!token || token.revoked || token.expiresAt < new Date()) return false;
  return true;
}

/** Parse a duration string like "15m", "7d", "1h" to ms. */
function parseExpiry(s: string): number {
  const match = /^(\d+)([smhd])$/.exec(s);
  if (!match) return 15 * 60 * 1000; // default 15min
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 3600 * 1000;
    case "d": return n * 86400 * 1000;
    default:  return 15 * 60 * 1000;
  }
}
