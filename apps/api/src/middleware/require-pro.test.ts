import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique } },
}));

vi.mock("../config/env.js", () => ({
  env: { MASTER_EMAIL: "master@example.com" },
}));

import { requirePro } from "./require-pro";

interface TestUser {
  email?: string;
  subscription?: { plan: string; status: string } | null;
  featureFlags?: { key: string; enabled: boolean }[];
}

async function buildApp() {
  const app = Fastify();
  // Stand-in for the authenticate middleware: stamp a user on the request.
  app.addHook("preHandler", async (request) => {
    (request as FastifyRequest & { user: { sub: string; email: string } }).user = {
      sub: "user-1",
      email: "unused@example.com",
    };
  });
  app.get("/pro", { preHandler: [requirePro("cloud_sync")] }, async () => ({ ok: true }));
  return app;
}

function mockUser(user: TestUser | null) {
  findUnique.mockResolvedValue(user);
}

describe("requirePro middleware", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("lets the master account through with no subscription row", async () => {
    mockUser({ email: "master@example.com", subscription: null, featureFlags: [] });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(200);
  });

  it("lets the master account through even with a disabled feature override", async () => {
    mockUser({
      email: "master@example.com",
      subscription: null,
      featureFlags: [{ key: "cloud_sync", enabled: false }],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(200);
  });

  it("passes an ACTIVE PRO subscriber", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "PRO", status: "ACTIVE" },
      featureFlags: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(200);
  });

  it("passes a TRIALING PRO subscriber", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "PRO", status: "TRIALING" },
      featureFlags: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a PRO subscriber whose subscription is past due", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "PRO", status: "PAST_DUE" },
      featureFlags: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: "ProRequired",
      upgrade: true,
      featureKey: "cloud_sync",
    });
  });

  it("rejects a FREE user", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "FREE", status: "ACTIVE" },
      featureFlags: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "ProRequired" });
  });

  it("rejects when the user no longer exists", async () => {
    mockUser(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "ProRequired" });
  });

  it("an enabled per-user override admits a FREE user", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "FREE", status: "ACTIVE" },
      featureFlags: [{ key: "cloud_sync", enabled: true }],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(200);
  });

  it("a disabled per-user override blocks even an ACTIVE PRO subscriber", async () => {
    mockUser({
      email: "viewer@example.com",
      subscription: { plan: "PRO", status: "ACTIVE" },
      featureFlags: [{ key: "cloud_sync", enabled: false }],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/pro" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "FeatureDisabled", upgrade: true });
  });

  it("selects only the feature flag matching the gate's feature key", async () => {
    mockUser({ email: "viewer@example.com", subscription: null, featureFlags: [] });
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/pro" });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        email: true,
        subscription: true,
        featureFlags: { where: { key: "cloud_sync" }, take: 1 },
      },
    });
  });
});
