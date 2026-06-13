import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  refreshSchema,
  logoutSchema,
  changePasswordSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type AuthResponse,
  type TokenPairResponse,
  Plan,
  SubscriptionStatus,
} from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { evaluateAchievements } from "../../lib/achievements.js";
import { isGoogleAuthConfigured, verifyGoogleIdToken } from "../../lib/google-auth.js";
import {
  PASSWORD_RESET_TTL_MINUTES,
  buildPasswordResetUrl,
  createPasswordResetToken,
  deliverPasswordResetEmail,
  hashPasswordResetToken,
} from "../../lib/password-reset.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
} from "../../lib/tokens.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import {
  isWebClient,
  setAuthCookies,
  clearAuthCookies,
  parseCookies,
  COOKIE_REFRESH_TOKEN,
} from "../../lib/cookies.js";

interface AuthUserRecord {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  createdAt: Date;
}

interface AuthSubscriptionRecord {
  plan: "FREE" | "PRO";
  status: string;
  billingInterval: "MONTHLY" | "YEARLY" | null;
  currentPeriodEnd: Date | null;
}

function toUserPayload(user: AuthUserRecord) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    displayName: user.displayName ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}

function toSubscriptionPayload(subscription?: AuthSubscriptionRecord | null) {
  return {
    plan: subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE,
    status: (subscription?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
    billingInterval: subscription?.billingInterval ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
  };
}

async function replyWithAuthSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  user: AuthUserRecord,
  subscription?: AuthSubscriptionRecord | null,
  statusCode = 200,
) {
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
  const userPayload = toUserPayload(user);
  const subscriptionPayload = toSubscriptionPayload(subscription);

  if (isWebClient(request)) {
    setAuthCookies(reply, accessToken, rawRefresh);
    return reply.code(statusCode).send({
      user: userPayload,
      subscription: subscriptionPayload,
    });
  }

  const response: AuthResponse = {
    user: userPayload,
    subscription: subscriptionPayload,
    accessToken,
    refreshToken: rawRefresh,
  };

  return reply.code(statusCode).send(response);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const forgotPasswordMessage = "If an account exists for that email, a reset link has been sent.";

  app.get("/google/config", async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!isGoogleAuthConfigured()) {
      return reply.code(200).send({ enabled: false });
    }

    return reply.code(200).send({
      enabled: true,
      clientId: env.GOOGLE_CLIENT_ID,
    });
  });

  // ── POST /v1/auth/register ────────────────────────────────────

  app.post(
    "/register",
    {
      preValidation: [validateBody(registerSchema)],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string; displayName?: string } }>,
      reply: FastifyReply,
    ) => {
      const { email, password } = request.body;
      const displayName = request.body.displayName?.trim() || undefined;

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
            googleSub: null,
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

      void evaluateAchievements(user.id);
      return replyWithAuthSession(
        app,
        request,
        reply,
        user,
        {
          plan: "FREE",
          status: SubscriptionStatus.ACTIVE,
          billingInterval: null,
          currentPeriodEnd: null,
        },
        201,
      );
    },
  );

  // ── POST /v1/auth/login ───────────────────────────────────────

  app.post(
    "/login",
    {
      preValidation: [validateBody(loginSchema)],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply,
    ) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { subscription: true },
      });

      if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid credentials" });
      }

      return replyWithAuthSession(app, request, reply, user, user.subscription);
    },
  );

  // ── POST /v1/auth/google ──────────────────────────────────────

  app.post(
    "/google",
    {
      preValidation: [validateBody(googleAuthSchema)],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest<{ Body: { credential: string } }>, reply: FastifyReply) => {
      if (!isGoogleAuthConfigured()) {
        return reply.code(503).send({
          error: "ServiceUnavailable",
          message: "Google Sign-In is not configured.",
        });
      }

      let identity;
      try {
        identity = await verifyGoogleIdToken(request.body.credential);
      } catch {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Google sign-in failed. Please try again.",
        });
      }

      const userByGoogle = await prisma.user.findUnique({
        where: { googleSub: identity.sub },
        include: { subscription: true },
      });

      if (userByGoogle) {
        return replyWithAuthSession(app, request, reply, userByGoogle, userByGoogle.subscription);
      }

      const existingByEmail = await prisma.user.findUnique({
        where: { email: identity.email },
        include: { subscription: true },
      });

      if (existingByEmail?.googleSub && existingByEmail.googleSub !== identity.sub) {
        return reply.code(409).send({
          error: "Conflict",
          message: "That email is already linked to a different Google account.",
        });
      }

      if (existingByEmail) {
        const linkedUser = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleSub: identity.sub,
            ...(existingByEmail.displayName ? {} : { displayName: identity.displayName }),
          },
          include: { subscription: true },
        });

        return replyWithAuthSession(app, request, reply, linkedUser, linkedUser.subscription);
      }

      const createdUser = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: identity.email,
            googleSub: identity.sub,
            passwordHash: null,
            displayName: identity.displayName,
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

      void evaluateAchievements(createdUser.id);

      return replyWithAuthSession(
        app,
        request,
        reply,
        createdUser,
        {
          plan: "FREE",
          status: SubscriptionStatus.ACTIVE,
          billingInterval: null,
          currentPeriodEnd: null,
        },
        201,
      );
    },
  );

  // ── POST /v1/auth/change-password ────────────────────────────

  app.post(
    "/change-password",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(changePasswordSchema)],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: sub },
      });

      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }

      if (!user.passwordHash) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "This account does not have password login enabled yet.",
        });
      }

      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Current password is incorrect",
        });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: sub },
          data: { passwordHash: await hashPassword(newPassword) },
        }),
        prisma.session.deleteMany({
          where: { userId: sub },
        }),
      ]);

      if (isWebClient(request)) {
        clearAuthCookies(reply);
      }

      return reply.code(200).send({
        message: "Password updated. Please sign in again.",
      });
    },
  );

  // ── POST /v1/auth/set-password ───────────────────────────────

  app.post(
    "/set-password",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(setPasswordSchema)],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const { newPassword } = request.body as { newPassword: string };

      const user = await prisma.user.findUnique({
        where: { id: sub },
      });

      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }

      if (user.passwordHash) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Password login is already enabled for this account.",
        });
      }

      await prisma.user.update({
        where: { id: sub },
        data: { passwordHash: await hashPassword(newPassword) },
      });

      return reply.code(200).send({
        message: "Password login is now enabled for your account.",
      });
    },
  );

  // ── POST /v1/auth/forgot-password ────────────────────────────

  app.post(
    "/forgot-password",
    {
      preValidation: [validateBody(forgotPasswordSchema)],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    },
    async (request: FastifyRequest<{ Body: { email: string } }>, reply: FastifyReply) => {
      const { email } = request.body;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      });

      if (!user) {
        return reply.code(200).send({ message: forgotPasswordMessage });
      }

      const reset = createPasswordResetToken();

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: reset.tokenHash,
            expiresAt: reset.expiresAt,
          },
        }),
      ]);

      const resetUrl = buildPasswordResetUrl(reset.token);
      const delivery = await deliverPasswordResetEmail(
        {
          to: user.email,
          displayName: user.displayName,
          resetUrl,
        },
        request.log,
      );

      return reply.code(200).send({
        message: forgotPasswordMessage,
        ...(delivery.previewUrl
          ? {
              debugResetUrl: delivery.previewUrl,
              debugNotice: `Email delivery is not configured, so this ${PASSWORD_RESET_TTL_MINUTES}-minute reset link is shown for local testing.`,
            }
          : {}),
      });
    },
  );

  // ── POST /v1/auth/reset-password ─────────────────────────────

  app.post(
    "/reset-password",
    {
      preValidation: [validateBody(resetPasswordSchema)],
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (
      request: FastifyRequest<{ Body: { token: string; newPassword: string } }>,
      reply: FastifyReply,
    ) => {
      const { token, newPassword } = request.body;
      const tokenHash = hashPasswordResetToken(token);

      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!resetToken) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "This reset link is invalid or has expired.",
        });
      }

      const nextPasswordHash = await hashPassword(newPassword);
      const usedAt = new Date();

      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash: nextPasswordHash },
        }),
        prisma.session.deleteMany({
          where: { userId: resetToken.userId },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt },
        }),
        prisma.passwordResetToken.deleteMany({
          where: {
            userId: resetToken.userId,
            usedAt: null,
            id: { not: resetToken.id },
          },
        }),
      ]);

      return reply.code(200).send({
        message: "Password reset. Please sign in again.",
      });
    },
  );

  // ── POST /v1/auth/refresh ─────────────────────────────────────

  app.post(
    "/refresh",
    {
      // Body validation only for non-web clients (web sends refresh token via cookie)
      preValidation: [
        async (request: FastifyRequest, reply: FastifyReply) => {
          if (!isWebClient(request)) {
            return validateBody(refreshSchema)(request, reply);
          }
        },
      ],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Resolve the refresh token from the correct source
      let refreshToken: string | undefined;

      if (isWebClient(request)) {
        const cookies = parseCookies(request.headers.cookie);
        refreshToken = cookies[COOKIE_REFRESH_TOKEN];
      } else {
        refreshToken = (request.body as { refreshToken?: string })?.refreshToken;
      }

      if (!refreshToken) {
        return reply.code(400).send({ error: "BadRequest", message: "Refresh token required" });
      }

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
        // If web client with invalid refresh token, clear stale cookies
        if (isWebClient(request)) {
          clearAuthCookies(reply);
        }
        return reply
          .code(401)
          .send({ error: "Unauthorized", message: "Invalid or expired refresh token" });
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

      // ── Web client: set rotated cookies ──────────────────────────
      if (isWebClient(request)) {
        setAuthCookies(reply, accessToken, newRawRefresh);
        return reply.code(200).send({ message: "Session refreshed" });
      }

      // ── Desktop client: return tokens in body ────────────────────
      const response: TokenPairResponse = {
        accessToken,
        refreshToken: newRawRefresh,
      };

      return reply.code(200).send(response);
    },
  );

  // ── POST /v1/auth/logout ──────────────────────────────────────

  app.post(
    "/logout",
    {
      // Body validation only for non-web clients
      preValidation: [
        async (request: FastifyRequest, reply: FastifyReply) => {
          if (!isWebClient(request)) {
            return validateBody(logoutSchema)(request, reply);
          }
        },
      ],
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Resolve refresh token from the correct source
      let refreshToken: string | undefined;

      if (isWebClient(request)) {
        const cookies = parseCookies(request.headers.cookie);
        refreshToken = cookies[COOKIE_REFRESH_TOKEN];
      } else {
        refreshToken = (request.body as { refreshToken?: string })?.refreshToken;
      }

      if (refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        await prisma.session.updateMany({
          where: { refreshTokenHash: tokenHash, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // Always clear cookies for web client (even if no refresh token)
      if (isWebClient(request)) {
        clearAuthCookies(reply);
      }

      return reply.code(200).send({ message: "Logged out" });
    },
  );
}
