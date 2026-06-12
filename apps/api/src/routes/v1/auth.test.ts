import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  subscription: {
    create: vi.fn(),
  },
  session: {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
};

const hashPasswordMock = vi.fn(async (value: string) => `hashed:${value}`);
const verifyPasswordMock = vi.fn();
const deliverPasswordResetEmailMock = vi.fn();
const verifyGoogleIdTokenMock = vi.fn();
const rawResetToken = ["raw", "reset", "token"].join("-");
const validResetToken = ["valid", "reset", "token"].join("-");
const validResetTokenHash = ["hashed", "valid", "reset", "token"].join("-");
const expiredResetToken = ["expired", "token"].join("-");
const newPasswordForTest = ["new", "password", "123"].join("-");
const jwtSecretForTest = ["auth", "routes", "jwt", "test", "secret"].join("-");

vi.mock("../../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../lib/password.js", () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
}));

vi.mock("../../lib/achievements.js", () => ({
  evaluateAchievements: vi.fn(),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    NODE_ENV: "development",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    COOKIE_DOMAIN: undefined,
    CORS_ORIGIN: "https://streamshogun.com",
    APP_PUBLIC_URL: "https://streamshogun.com",
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    SUPPORT_EMAIL: "support@streamshogun.com",
    SMTP_URL: undefined,
    EMAIL_FROM: undefined,
  },
}));

vi.mock("../../lib/google-auth.js", () => ({
  isGoogleAuthConfigured: () => true,
  verifyGoogleIdToken: verifyGoogleIdTokenMock,
}));

vi.mock("../../lib/password-reset.js", () => ({
  PASSWORD_RESET_TTL_MINUTES: 60,
  createPasswordResetToken: () => ({
    token: rawResetToken,
    tokenHash: "hashed-reset-token",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  }),
  hashPasswordResetToken: (token: string) =>
    token === validResetToken ? validResetTokenHash : `hash:${token}`,
  buildPasswordResetUrl: (token: string) =>
    `https://streamshogun.com/reset-password?token=${token}`,
  deliverPasswordResetEmail: deliverPasswordResetEmailMock,
}));

describe("auth password reset routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  async function buildTestApp() {
    const { authRoutes } = await import("./auth.js");
    const app = Fastify();
    await app.register(jwt, { secret: jwtSecretForTest });
    await app.register(authRoutes, { prefix: "/v1/auth" });
    return app;
  }

  it("returns a generic forgot-password response when no account exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "missing@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    expect(deliverPasswordResetEmailMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("creates a reset token and returns a preview link in development", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
      displayName: "Colin",
    });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.passwordResetToken.create.mockResolvedValue({ id: "prt_123" });
    deliverPasswordResetEmailMock.mockResolvedValue({
      delivered: false,
      previewUrl: `https://streamshogun.com/reset-password?token=${rawResetToken}`,
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "user@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
      debugResetUrl: `https://streamshogun.com/reset-password?token=${rawResetToken}`,
      debugNotice:
        "Email delivery is not configured, so this 60-minute reset link is shown for local testing.",
    });
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: "user_123",
        tokenHash: "hashed-reset-token",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
    expect(deliverPasswordResetEmailMock).toHaveBeenCalledWith(
      {
        to: "user@example.com",
        displayName: "Colin",
        resetUrl: `https://streamshogun.com/reset-password?token=${rawResetToken}`,
      },
      expect.any(Object),
    );

    await app.close();
  });

  it("resets the password, revokes sessions, and burns other reset tokens", async () => {
    prismaMock.passwordResetToken.findFirst.mockResolvedValue({
      id: "prt_valid",
      userId: "user_123",
      tokenHash: validResetTokenHash,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      usedAt: null,
    });
    prismaMock.user.update.mockResolvedValue({ id: "user_123" });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.passwordResetToken.update.mockResolvedValue({ id: "prt_valid" });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 3 });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: {
        token: validResetToken,
        newPassword: newPasswordForTest,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: "Password reset. Please sign in again.",
    });
    expect(hashPasswordMock).toHaveBeenCalledWith("new-password-123");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: { passwordHash: "hashed:new-password-123" },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_123" },
    });
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "prt_valid" },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user_123",
        usedAt: null,
        id: { not: "prt_valid" },
      },
    });

    await app.close();
  });

  it("rejects expired or invalid reset tokens", async () => {
    prismaMock.passwordResetToken.findFirst.mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: {
        token: expiredResetToken,
        newPassword: newPasswordForTest,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BadRequest",
      message: "This reset link is invalid or has expired.",
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns the Google auth config for the site", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/config",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      enabled: true,
      clientId: "google-client-id.apps.googleusercontent.com",
    });

    await app.close();
  });

  it("links an existing email/password user to Google and creates a session", async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({
      sub: "google-sub-123",
      email: "user@example.com",
      displayName: "Colin",
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "user_123",
      email: "user@example.com",
      googleSub: null,
      passwordHash: "hashed:existing-password",
      username: null,
      displayName: null,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
        billingInterval: null,
        currentPeriodEnd: null,
      },
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
      googleSub: "google-sub-123",
      passwordHash: "hashed:existing-password",
      username: null,
      displayName: "Colin",
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
        billingInterval: null,
        currentPeriodEnd: null,
      },
    });
    prismaMock.session.create.mockResolvedValue({ id: "session_123" });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { credential: "google-id-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: {
        googleSub: "google-sub-123",
        displayName: "Colin",
      },
      include: { subscription: true },
    });
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        userId: "user_123",
        refreshTokenHash: expect.any(String),
        userAgent: expect.any(String),
        expiresAt: expect.any(Date),
      },
    });

    const body = response.json();
    expect(body.user.email).toBe("user@example.com");
    expect(body.subscription.plan).toBe("FREE");
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");

    await app.close();
  });

  it("creates a Google-only account with password login disabled", async () => {
    verifyGoogleIdTokenMock.mockResolvedValue({
      sub: "google-sub-new",
      email: "new@example.com",
      displayName: "New User",
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user_new",
      email: "new@example.com",
      googleSub: "google-sub-new",
      passwordHash: null,
      username: null,
      displayName: "New User",
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    prismaMock.subscription.create.mockResolvedValue({ id: "sub_new" });
    prismaMock.session.create.mockResolvedValue({ id: "session_new" });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: { credential: "google-id-token" },
    });

    expect(response.statusCode).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "new@example.com",
        googleSub: "google-sub-new",
        passwordHash: null,
        displayName: "New User",
      },
    });
    expect(prismaMock.subscription.create).toHaveBeenCalledWith({
      data: {
        userId: "user_new",
        plan: "FREE",
        status: "ACTIVE",
      },
    });

    await app.close();
  });
});
