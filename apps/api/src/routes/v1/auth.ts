import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  type AuthResponse,
  type TokenPairResponse,
  Plan,
  SubscriptionStatus,
} from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "../../lib/tokens.js";
import { validateBody } from "../../middleware/validate.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /v1/auth/register ────────────────────────────────────

  app.post(
    "/register",
    { preValidation: [validateBody(registerSchema)] },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string; displayName?: string } }>,
      reply: FastifyReply
    ) => {
      const { email, password, displayName } = request.body;

      // Check existing user
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "Conflict", message: "Email already registered" });
      }

      // Create user + FREE subscription in a transaction
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            passwordHash: await hashPassword(password),
            displayName,
          },
        });

        await tx.subscription.create({
          data: {
            userId: newUser.id,
            plan: "FREE",
            status: "ACTIVE",
          },
        });

        return newUser;
      });

      // Create session
      const rawRefresh = generateRefreshToken();
      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashRefreshToken(rawRefresh),
          userAgent: request.headers["user-agent"] ?? null,
          expiresAt: refreshTokenExpiresAt(),
        },
      });

      const accessToken = signAccessToken(app, { sub: user.id, email: user.email });

      const response: AuthResponse = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? undefined,
          createdAt: user.createdAt.toISOString(),
        },
        subscription: {
          plan: Plan.FREE,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: null,
        },
        accessToken,
        refreshToken: rawRefresh,
      };

      return reply.code(201).send(response);
    }
  );

  // ── POST /v1/auth/login ───────────────────────────────────────

  app.post(
    "/login",
    { preValidation: [validateBody(loginSchema)] },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply
    ) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { subscription: true },
      });

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });
      }

      // Create session
      const rawRefresh = generateRefreshToken();
      await prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashRefreshToken(rawRefresh),
          userAgent: request.headers["user-agent"] ?? null,
          expiresAt: refreshTokenExpiresAt(),
        },
      });

      const accessToken = signAccessToken(app, { sub: user.id, email: user.email });
      const sub = user.subscription;

      const response: AuthResponse = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? undefined,
          createdAt: user.createdAt.toISOString(),
        },
        subscription: {
          plan: sub?.plan === "PRO" ? Plan.PRO : Plan.FREE,
          status: (sub?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
          currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
        },
        accessToken,
        refreshToken: rawRefresh,
      };

      return reply.code(200).send(response);
    }
  );

  // ── POST /v1/auth/refresh ─────────────────────────────────────

  app.post(
    "/refresh",
    { preValidation: [validateBody(refreshSchema)] },
    async (
      request: FastifyRequest<{ Body: { refreshToken: string } }>,
      reply: FastifyReply
    ) => {
      const { refreshToken } = request.body;
      const tokenHash = hashRefreshToken(refreshToken);

      // Find valid session
      const session = await prisma.session.findFirst({
        where: {
          refreshTokenHash: tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });

      if (!session) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired refresh token" });
      }

      // Rotate: revoke old session, create new one
      const newRawRefresh = generateRefreshToken();

      await prisma.$transaction([
        prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        }),
        prisma.session.create({
          data: {
            userId: session.userId,
            refreshTokenHash: hashRefreshToken(newRawRefresh),
            userAgent: request.headers["user-agent"] ?? null,
            expiresAt: refreshTokenExpiresAt(),
          },
        }),
      ]);

      const accessToken = signAccessToken(app, {
        sub: session.user.id,
        email: session.user.email,
      });

      const response: TokenPairResponse = {
        accessToken,
        refreshToken: newRawRefresh,
      };

      return reply.code(200).send(response);
    }
  );

  // ── POST /v1/auth/logout ──────────────────────────────────────

  app.post(
    "/logout",
    {
      preValidation: [validateBody(logoutSchema)],
    },
    async (
      request: FastifyRequest<{ Body: { refreshToken: string } }>,
      reply: FastifyReply
    ) => {
      const { refreshToken } = request.body;
      const tokenHash = hashRefreshToken(refreshToken);

      // Revoke session (ignore if not found)
      await prisma.session.updateMany({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return reply.code(200).send({ message: "Logged out" });
    }
  );
}
