import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { describe, expect, it, vi } from "vitest";

// cookies.ts pulls config/env at module scope; mock it like the route tests.
vi.mock("../config/env.js", () => ({ env: { NODE_ENV: "test" } }));

import { authenticate } from "./authenticate";
import { COOKIE_ACCESS_TOKEN } from "../lib/cookies";

const SECRET = ["auth", "middleware", "test", "secret"].join("-");

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: SECRET });
  app.get("/protected", { preHandler: authenticate }, async (request) => ({
    user: request.user,
    authSource: (request as { _authSource?: string })._authSource ?? null,
  }));
  return app;
}

describe("authenticate middleware", () => {
  it("rejects requests with no credentials", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
    await app.close();
  });

  it("authenticates a valid Bearer token via the header path", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "u1", email: "master@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { sub: "u1", email: "master@example.com" },
      authSource: "header",
    });
    await app.close();
  });

  it("authenticates a valid access_token cookie via the cookie path", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "u2", email: "web@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: `${COOKIE_ACCESS_TOKEN}=${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().authSource).toBe("cookie");
    await app.close();
  });

  it("fails closed: an invalid Bearer token must not fall through to a valid cookie", async () => {
    const app = await buildApp();
    const goodCookie = app.jwt.sign({ sub: "victim", email: "victim@example.com" });
    const badBearer = `${SECRET}-forged`; // well-formed shape, bad signature
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: {
        authorization: `Bearer ${badBearer}`,
        cookie: `${COOKIE_ACCESS_TOKEN}=${goodCookie}`,
      },
    });
    // 401, not a silent authentication as the cookie identity.
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("a malformed (non-Bearer) Authorization header still allows cookie auth", async () => {
    const app = await buildApp();
    const token = app.jwt.sign({ sub: "u3", email: "web@example.com" });
    for (const header of ["Basic dXNlcjpwYXNz", "Bearer"]) {
      const res = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { authorization: header, cookie: `${COOKIE_ACCESS_TOKEN}=${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().authSource).toBe("cookie");
    }
    await app.close();
  });

  it("rejects an expired or foreign-signed cookie token", async () => {
    const app = await buildApp();
    const foreign = Fastify();
    await foreign.register(jwt, { secret: "another-secret" });
    const foreignToken = foreign.jwt.sign({ sub: "u4", email: "x@example.com" });

    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { cookie: `${COOKIE_ACCESS_TOKEN}=${foreignToken}` },
    });
    expect(res.statusCode).toBe(401);
    await foreign.close();
    await app.close();
  });

  it("header auth wins over cookie when both are valid", async () => {
    const app = await buildApp();
    const headerToken = app.jwt.sign({ sub: "header-user", email: "h@example.com" });
    const cookieToken = app.jwt.sign({ sub: "cookie-user", email: "c@example.com" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: {
        authorization: `Bearer ${headerToken}`,
        cookie: `${COOKIE_ACCESS_TOKEN}=${cookieToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { sub: "header-user" },
      authSource: "header",
    });
    await app.close();
  });
});
