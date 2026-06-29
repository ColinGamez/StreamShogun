import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLAG_KEYS } from "@stream-shogun/shared";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../config/env.js", () => ({
  env: {
    MASTER_EMAIL: "colin.kenny777@gmail.com",
    FOUNDING_MEMBER_CUTOFF: "2026-06-01T00:00:00Z",
  },
}));

const jwtSecretForTest = ["features", "routes", "jwt", "test", "secret"].join("-");

async function buildTestApp() {
  const { featuresRoutes } = await import("./features.js");
  const app = Fastify();
  await app.register(jwt, { secret: jwtSecretForTest });
  await app.register(featuresRoutes, { prefix: "/v1/features" });
  return app;
}

function authHeader(app: Awaited<ReturnType<typeof buildTestApp>>, email: string) {
  const token = app.jwt.sign({ sub: "user_123", email });
  return { authorization: `Bearer ${token}` };
}

describe("features routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
      subscription: { plan: "FREE", status: "ACTIVE", billingInterval: null },
      featureFlags: [],
    });
  });

  it("treats the configured master email as Pro", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/features",
      headers: authHeader(app, "COLIN.KENNY777@gmail.com"),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.plan).toBe("PRO");
    for (const key of FLAG_KEYS) {
      expect(body.flags[key]).toBe(true);
    }

    await app.close();
  });

  it("keeps normal free users on Free", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/features",
      headers: authHeader(app, "viewer@example.com"),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.plan).toBe("FREE");
    for (const key of FLAG_KEYS) {
      expect(body.flags[key]).toBe(false);
    }

    await app.close();
  });
});
