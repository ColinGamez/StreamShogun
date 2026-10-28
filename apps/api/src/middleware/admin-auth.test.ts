import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: { ADMIN_KEY: "test-admin-key" as string | undefined },
}));

vi.mock("../config/env.js", () => ({ env: envMock }));

import { adminAuth } from "./admin-auth";

async function buildApp() {
  const app = Fastify();
  app.get("/admin", { preHandler: [adminAuth] }, async () => ({ ok: true }));
  return app;
}

describe("adminAuth middleware", () => {
  beforeEach(() => {
    envMock.ADMIN_KEY = "test-admin-key";
  });

  it("returns 501 when ADMIN_KEY is not configured (defence in depth)", async () => {
    envMock.ADMIN_KEY = undefined;
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin",
      headers: { "x-admin-key": "anything" },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: "NotImplemented" });
  });

  it("returns 401 when the header is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/admin" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 401 for a wrong key of equal length", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin",
      headers: { "x-admin-key": "XXXX-admin-key" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a key of different length (timing-safe short-circuit)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin",
      headers: { "x-admin-key": "short" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a repeated (array) header rather than comparing it", async () => {
    const reply = {
      code(code: number) {
        this.statusCode = code;
        return this;
      },
      send(body: unknown) {
        this.body = body;
        return this;
      },
      statusCode: 0,
      body: undefined as unknown,
    };
    const request = {
      headers: { "x-admin-key": ["test-admin-key", "test-admin-key"] },
      log: { warn: vi.fn() },
      id: "req-1",
      url: "/admin",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminAuth(request as any, reply as any);
    expect(reply.statusCode).toBe(401);
  });

  it("passes with the exact configured key", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/admin",
      headers: { "x-admin-key": "test-admin-key" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
