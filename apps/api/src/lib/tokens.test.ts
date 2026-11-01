import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
  },
}));

import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
  ttlToMs,
} from "./tokens";

describe("ttlToMs", () => {
  it("converts s/m/h/d suffixes", () => {
    expect(ttlToMs("30s")).toBe(30_000);
    expect(ttlToMs("15m")).toBe(900_000);
    expect(ttlToMs("12h")).toBe(43_200_000);
    expect(ttlToMs("30d")).toBe(2_592_000_000);
  });

  it("rejects malformed or unknown TTLs", () => {
    expect(() => ttlToMs("")).toThrow(/Invalid TTL/);
    expect(() => ttlToMs("15")).toThrow(/Invalid TTL/);
    expect(() => ttlToMs("15w")).toThrow(/Invalid TTL/);
    expect(() => ttlToMs("m")).toThrow(/Invalid TTL/);
    expect(() => ttlToMs("-15m")).toThrow(/Invalid TTL/);
  });
});

describe("generateRefreshToken / hashRefreshToken", () => {
  it("generates unique 48-byte base64url tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{64}$/); // 48 bytes -> 64 base64url chars
  });

  it("hashes deterministically to sha256 hex (raw token never stored)", () => {
    const token = "some-opaque-token";
    const hash = hashRefreshToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("refreshTokenExpiresAt", () => {
  it("is ~30d out per the configured JWT_REFRESH_TTL", () => {
    const before = Date.now();
    const expiry = refreshTokenExpiresAt().getTime();
    const after = Date.now();
    const expected = 2_592_000_000;
    expect(expiry).toBeGreaterThanOrEqual(before + expected);
    expect(expiry).toBeLessThanOrEqual(after + expected);
  });
});

describe("signAccessToken", () => {
  it("signs sub/email claims with the configured TTL", async () => {
    const app = Fastify();
    await app.register(jwt, { secret: "tokens-test-secret-1234567890" });

    const token = signAccessToken(app, { sub: "user-1", email: "viewer@example.com" });
    const decoded = app.jwt.decode<{ sub: string; email: string; iat: number; exp: number }>(token);

    expect(decoded?.sub).toBe("user-1");
    expect(decoded?.email).toBe("viewer@example.com");
    expect(decoded && decoded.exp - decoded.iat).toBe(900); // 15m in seconds

    // Verifies with the same secret
    const verified = app.jwt.verify<{ sub: string }>(token);
    expect(verified.sub).toBe("user-1");

    await app.close();
  });
});
