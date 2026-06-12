import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ttlToMs } from "./tokens.js";

// ── Cookie names ────────────────────────────────────────────────────

export const COOKIE_ACCESS_TOKEN = "access_token";
export const COOKIE_REFRESH_TOKEN = "refresh_token";
export const COOKIE_CSRF_TOKEN = "csrf_token";

// ── Helpers ─────────────────────────────────────────────────────────

const isProd = () => env.NODE_ENV === "production";

function isLocalCookieHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function cookieScopeForReply(reply: FastifyReply): {
  secure: boolean;
  domain: string | undefined;
} {
  const localHost = isLocalCookieHost(reply.request.headers.host);
  return {
    secure: isProd() && !localHost,
    domain: localHost ? undefined : (env.COOKIE_DOMAIN ?? undefined),
  };
}

/**
 * Parse the Cookie header into a key-value map.
 * Avoids adding @fastify/cookie as a dependency.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const entries: [string, string][] = [];
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    entries.push([pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()]);
  }
  return Object.fromEntries(entries);
}

/**
 * Detect whether the current request is coming from the web client.
 */
export function isWebClient(request: FastifyRequest): boolean {
  return request.headers["x-client"] === "web";
}

// ── Set / clear auth cookies ────────────────────────────────────────

/**
 * Set httpOnly secure auth cookies (access + refresh) and a readable CSRF cookie.
 */
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
): void {
  const { secure, domain } = cookieScopeForReply(reply);

  // Access token cookie — httpOnly, not readable by JS
  setCookie(reply, COOKIE_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    domain,
    maxAge: Math.floor(ttlToMs(env.JWT_ACCESS_TTL) / 1000),
  });

  // Refresh token cookie — httpOnly, scoped to /v1/auth to limit exposure
  setCookie(reply, COOKIE_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/v1/auth",
    domain,
    maxAge: Math.floor(ttlToMs(env.JWT_REFRESH_TTL) / 1000),
  });

  // CSRF double-submit cookie — readable by JS (not httpOnly)
  const csrfToken = generateCsrfToken();
  setCookie(reply, COOKIE_CSRF_TOKEN, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    path: "/",
    domain,
    maxAge: Math.floor(ttlToMs(env.JWT_REFRESH_TTL) / 1000),
  });
}

/**
 * Clear all auth cookies (access, refresh, CSRF).
 */
export function clearAuthCookies(reply: FastifyReply): void {
  const { secure, domain } = cookieScopeForReply(reply);

  for (const { name, path } of [
    { name: COOKIE_ACCESS_TOKEN, path: "/" },
    { name: COOKIE_REFRESH_TOKEN, path: "/v1/auth" },
    { name: COOKIE_CSRF_TOKEN, path: "/" },
  ]) {
    setCookie(reply, name, "", {
      httpOnly: name !== COOKIE_CSRF_TOKEN,
      secure,
      sameSite: "Lax",
      path,
      domain,
      maxAge: 0,
    });
  }
}

// ── CSRF ────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Validate the CSRF double-submit pattern.
 * Compares the `csrf_token` cookie with the `X-CSRF-Token` header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateCsrf(request: FastifyRequest): boolean {
  const cookies = parseCookies(request.headers.cookie);
  const cookieToken = cookies[COOKIE_CSRF_TOKEN];
  const headerToken = request.headers["x-csrf-token"] as string | undefined;

  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  } catch {
    return false;
  }
}

// ── Internal: raw Set-Cookie header builder ─────────────────────────

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
  path: string;
  domain?: string;
  maxAge: number;
}

function setCookie(reply: FastifyReply, name: string, value: string, opts: CookieOptions): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path}`);
  parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`SameSite=${opts.sameSite}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);

  // Append to existing Set-Cookie headers (Fastify supports multiple)
  void reply.header("Set-Cookie", parts.join("; "));
}
