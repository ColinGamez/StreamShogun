import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { findUnique: vi.fn() },
};

vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../config/env.js", () => ({
  env: { MASTER_EMAIL: "colin.kenny777@gmail.com" },
}));

const jwtSecretForTest = ["me", "routes", "jwt", "test", "secret"].join("-");

async function buildTestApp() {
  const { meRoutes } = await import("./me.js");
  const app = Fastify();
  await app.register(jwt, { secret: jwtSecretForTest });
  await app.register(meRoutes, { prefix: "/v1/me" });
  return app;
}

describe("me route master entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_master",
      email: "colin.kenny777@gmail.com",
      username: "colin",
      displayName: "Colin",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      googleSub: null,
      passwordHash: "hashed-password",
      subscription: {
        plan: "FREE",
        status: "ACTIVE",
        billingInterval: null,
        currentPeriodEnd: null,
      },
    });
  });

  it("reports Pro to the website for the configured master account", async () => {
    const app = await buildTestApp();
    const token = app.jwt.sign({ sub: "user_master", email: "colin.kenny777@gmail.com" });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().subscription).toEqual({
      plan: "PRO",
      status: "ACTIVE",
      billingInterval: null,
      currentPeriodEnd: null,
    });
    await app.close();
  });
});
