// ── Auth routes — register / login / refresh / logout ──────────────────

import type { FastifyInstance } from "fastify";
import { registerBody, loginBody, refreshBody } from "../schemas/index.js";
import {
  prisma,
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  validateRefreshToken,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from "../lib/index.js";
import { authenticate } from "../middleware/index.js";

/** Default feature flags seeded for every new user. */
const DEFAULT_FLAGS = [
  "discord_rpc",
  "multi_epg_merge",
  "fuzzy_matching",
  "pip_window",
  "auto_refresh",
] as const;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /auth/register ─────────────────────────────────────────────
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    // Check for duplicate
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);

    // Create user + free subscription + default flags in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash },
      });

      await tx.subscription.create({
        data: {
          userId: u.id,
          plan: "free",
          status: "active",
        },
      });

      await tx.featureFlag.createMany({
        data: DEFAULT_FLAGS.map((flag) => ({
          userId: u.id,
          flagName: flag,
          enabled: false,
        })),
      });

      return u;
    });

    const accessToken = signAccessToken(app, { sub: user.id, email: user.email });
    const refreshToken = await signRefreshToken(app, user.id);

    return reply.status(201).send({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      accessToken,
      refreshToken,
    });
  });

  // ── POST /auth/login ────────────────────────────────────────────────
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const accessToken = signAccessToken(app, { sub: user.id, email: user.email });
    const refreshToken = await signRefreshToken(app, user.id);

    return reply.send({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      accessToken,
      refreshToken,
    });
  });

  // ── POST /auth/refresh ──────────────────────────────────────────────
  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { refreshToken } = parsed.data;

    let payload: RefreshTokenPayload;
    try {
      payload = app.jwt.verify<RefreshTokenPayload>(refreshToken);
    } catch {
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    const isValid = await validateRefreshToken(payload.jti);
    if (!isValid) {
      return reply.status(401).send({ error: "Refresh token revoked or expired" });
    }

    // Rotate: revoke old, issue new pair
    await revokeRefreshToken(payload.jti);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return reply.status(401).send({ error: "User not found" });
    }

    const newAccess = signAccessToken(app, { sub: user.id, email: user.email });
    const newRefresh = await signRefreshToken(app, user.id);

    return reply.send({ accessToken: newAccess, refreshToken: newRefresh });
  });

  // ── POST /auth/logout ───────────────────────────────────────────────
  app.post(
    "/auth/logout",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sub } = request.user as AccessTokenPayload;
      await revokeAllUserTokens(sub);
      return reply.send({ message: "Logged out" });
    },
  );
}
