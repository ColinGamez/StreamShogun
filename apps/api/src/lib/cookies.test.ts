import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "production",
    COOKIE_DOMAIN: ".example.com",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "30d",
  },
}));

import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_CSRF_TOKEN,
  COOKIE_REFRESH_TOKEN,
  clearAuthCookies,
  generateCsrfToken,
  parseCookies,
  setAuthCookies,
  validateCsrf,
} from "./cookies";

// ── Minimal FastifyReply stub: setCookie only touches these ─────────

function fakeReply(host: string | undefined): {
  reply: FastifyReply;
  setCookies: () => string[];
} {
  const headers = new Map<string, unknown>();
  const reply = {
    request: { headers: { host } },
    header(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
      return reply;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
  } as unknown as FastifyReply;
  return {
    reply,
    setCookies: () => {
      const v = headers.get("set-cookie");
      return Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
    },
  };
}

function fakeRequest(headers: Record<string, string | undefined>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

// ── parseCookies ────────────────────────────────────────────────────

describe("parseCookies", () => {
  it("returns an empty map for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("splits on ';' and trims whitespace around names and values", () => {
    expect(parseCookies("a=1; b=2 ;  c=3")).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("keeps '=' inside the value (only the first '=' splits)", () => {
    expect(parseCookies("token=abc=def==")).toEqual({ token: "abc=def==" });
  });

  it("skips pairs without '='", () => {
    expect(parseCookies("flag; a=1; alsoflag")).toEqual({ a: "1" });
  });

  it("later duplicates win (Object.fromEntries semantics)", () => {
    expect(parseCookies("a=1; a=2")).toEqual({ a: "2" });
  });
});

// ── CSRF ────────────────────────────────────────────────────────────

describe("generateCsrfToken", () => {
  it("produces unique base64url tokens of 32 random bytes", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes -> 43 base64url chars
  });
});

describe("validateCsrf", () => {
  it("accepts a matching cookie/header pair", () => {
    const token = generateCsrfToken();
    expect(
      validateCsrf(fakeRequest({ cookie: `csrf_token=${token}`, "x-csrf-token": token })),
    ).toBe(true);
  });

  it("rejects a mismatched header of equal length", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a.length).toBe(b.length);
    expect(validateCsrf(fakeRequest({ cookie: `csrf_token=${a}`, "x-csrf-token": b }))).toBe(false);
  });

  it("rejects length mismatch without throwing", () => {
    expect(
      validateCsrf(
        fakeRequest({ cookie: "csrf_token=short", "x-csrf-token": "much-longer-token" }),
      ),
    ).toBe(false);
  });

  it("rejects when either side is missing", () => {
    const token = generateCsrfToken();
    expect(validateCsrf(fakeRequest({ "x-csrf-token": token }))).toBe(false);
    expect(validateCsrf(fakeRequest({ cookie: `csrf_token=${token}` }))).toBe(false);
    expect(validateCsrf(fakeRequest({}))).toBe(false);
  });
});

// ── setAuthCookies / clearAuthCookies scoping ───────────────────────

describe("setAuthCookies", () => {
  it("sets all three cookies (access, refresh, CSRF) without clobbering", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "access-jwt", "refresh-opaque");
    const cookies = setCookies();

    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toContain(`${COOKIE_ACCESS_TOKEN}=access-jwt`);
    expect(cookies[1]).toContain(`${COOKIE_REFRESH_TOKEN}=refresh-opaque`);
    expect(cookies[2]).toContain(`${COOKIE_CSRF_TOKEN}=`);
  });

  it("marks access + refresh httpOnly but leaves the CSRF cookie readable", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "a", "r");
    const [access, refresh, csrf] = setCookies();

    expect(access).toContain("HttpOnly");
    expect(refresh).toContain("HttpOnly");
    expect(csrf).not.toContain("HttpOnly");
  });

  it("scopes the refresh cookie to /v1/auth and the others to /", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "a", "r");
    const [access, refresh, csrf] = setCookies();

    expect(access).toContain("Path=/");
    expect(csrf).toContain("Path=/");
    expect(refresh).toContain("Path=/v1/auth");
  });

  it("derives Max-Age from the configured TTLs", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "a", "r");
    const [access, refresh, csrf] = setCookies();

    expect(access).toContain("Max-Age=900"); // 15m
    expect(refresh).toContain("Max-Age=2592000"); // 30d
    expect(csrf).toContain("Max-Age=2592000"); // 30d
  });

  it("uses Secure + COOKIE_DOMAIN in production for non-local hosts", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "a", "r");
    for (const cookie of setCookies()) {
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("Domain=.example.com");
    }
  });

  it.each(["localhost:8787", "127.0.0.1"])(
    "drops Secure and Domain for local host %s (even in production)",
    (host) => {
      const { reply, setCookies } = fakeReply(host);
      setAuthCookies(reply, "a", "r");
      for (const cookie of setCookies()) {
        expect(cookie).not.toContain("Secure");
        expect(cookie).not.toContain("Domain=");
      }
    },
  );

  it("encodes cookie values", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    setAuthCookies(reply, "with space&=", "r");
    expect(setCookies()[0]).toContain(
      `${COOKIE_ACCESS_TOKEN}=${encodeURIComponent("with space&=")}`,
    );
  });
});

describe("clearAuthCookies", () => {
  it("expires all three cookies with their original paths", () => {
    const { reply, setCookies } = fakeReply("api.example.com");
    clearAuthCookies(reply);
    const cookies = setCookies();

    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toContain(`${COOKIE_ACCESS_TOKEN}=`);
    expect(cookies[0]).toContain("Max-Age=0");
    expect(cookies[1]).toContain(`${COOKIE_REFRESH_TOKEN}=`);
    expect(cookies[1]).toContain("Path=/v1/auth");
    expect(cookies[2]).toContain(`${COOKIE_CSRF_TOKEN}=`);
    expect(cookies[2]).toContain("Max-Age=0");
  });

  it("clears with the same local-host scoping so the browser matches the set cookie", () => {
    const { reply, setCookies } = fakeReply("localhost:8787");
    clearAuthCookies(reply);
    for (const cookie of setCookies()) {
      expect(cookie).not.toContain("Secure");
      expect(cookie).not.toContain("Domain=");
    }
  });
});
