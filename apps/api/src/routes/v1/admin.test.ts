import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test the pagination helper extracted from admin routes ───────
// We import admin routes module to test what we can in isolation.
// For the pagination logic we replicate it here since it's module-private.

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function pagination(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const raw =
    Number(query.pageSize) || Number(query.perPage) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(raw, 1), MAX_PAGE_SIZE);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

describe("admin pagination", () => {
  it("defaults to page 1, pageSize 25", () => {
    const result = pagination({});
    expect(result).toEqual({ skip: 0, take: 25, page: 1, pageSize: 25 });
  });

  it("accepts pageSize param", () => {
    const result = pagination({ page: "2", pageSize: "10" });
    expect(result).toEqual({ skip: 10, take: 10, page: 2, pageSize: 10 });
  });

  it("accepts legacy perPage param", () => {
    const result = pagination({ page: "1", perPage: "50" });
    expect(result).toEqual({ skip: 0, take: 50, page: 1, pageSize: 50 });
  });

  it("prefers pageSize over perPage", () => {
    const result = pagination({ pageSize: "15", perPage: "50" });
    expect(result).toEqual({ skip: 0, take: 15, page: 1, pageSize: 15 });
  });

  it("clamps pageSize to MAX_PAGE_SIZE (100)", () => {
    const result = pagination({ pageSize: "999" });
    expect(result.pageSize).toBe(100);
    expect(result.take).toBe(100);
  });

  it("clamps pageSize minimum to 1", () => {
    const result = pagination({ pageSize: "-5" });
    expect(result.pageSize).toBe(1); // Math.max(-5, 1) = 1
  });

  it("clamps page minimum to 1", () => {
    const result = pagination({ page: "0" });
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it("clamps negative page to 1", () => {
    const result = pagination({ page: "-3" });
    expect(result.page).toBe(1);
  });

  it("calculates skip correctly for page 3, pageSize 10", () => {
    const result = pagination({ page: "3", pageSize: "10" });
    expect(result.skip).toBe(20);
  });
});

// ── Test adminAuth middleware ────────────────────────────────────

describe("adminAuth middleware", () => {
  // Dynamic import so we can mock env before loading
  const ADMIN_KEY = "super-secret-admin-key-1234";

  function makeMocks(headers: Record<string, string> = {}) {
    const request = {
      headers,
      id: "req-123",
      url: "/v1/admin/users",
      log: { warn: vi.fn() },
    };
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    return { request, reply };
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 501 when ADMIN_KEY is not configured", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { ADMIN_KEY: undefined },
    }));
    const { adminAuth } = await import("../../middleware/admin-auth.js");
    const { request, reply } = makeMocks();

    await adminAuth(
      request as unknown as Parameters<typeof adminAuth>[0],
      reply as unknown as Parameters<typeof adminAuth>[1],
    );

    expect(reply.code).toHaveBeenCalledWith(501);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "NotImplemented" }),
    );
  });

  it("returns 401 when x-admin-key header is missing", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { ADMIN_KEY },
    }));
    const { adminAuth } = await import("../../middleware/admin-auth.js");
    const { request, reply } = makeMocks({});

    await adminAuth(
      request as unknown as Parameters<typeof adminAuth>[0],
      reply as unknown as Parameters<typeof adminAuth>[1],
    );

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Unauthorized" }),
    );
  });

  it("returns 401 when x-admin-key is wrong", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { ADMIN_KEY },
    }));
    const { adminAuth } = await import("../../middleware/admin-auth.js");
    const { request, reply } = makeMocks({ "x-admin-key": "wrong-key" });

    await adminAuth(
      request as unknown as Parameters<typeof adminAuth>[0],
      reply as unknown as Parameters<typeof adminAuth>[1],
    );

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it("passes through when x-admin-key matches", async () => {
    vi.doMock("../../config/env.js", () => ({
      env: { ADMIN_KEY },
    }));
    const { adminAuth } = await import("../../middleware/admin-auth.js");
    const { request, reply } = makeMocks({ "x-admin-key": ADMIN_KEY });

    await adminAuth(
      request as unknown as Parameters<typeof adminAuth>[0],
      reply as unknown as Parameters<typeof adminAuth>[1],
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});

// ── Test Zod schemas (replicated from admin.ts) ─────────────────

import { z } from "zod";

const featureFlagBody = z.object({
  userId: z.string().min(1),
  key: z.string().min(1),
  enabled: z.boolean(),
});

const grantProBody = z.object({
  userId: z.string().min(1),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  days: z.number().int().min(1).max(3650),
});

const revokeProBody = z.object({
  userId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

describe("featureFlagBody schema", () => {
  it("accepts valid input", () => {
    const result = featureFlagBody.safeParse({
      userId: "user_123",
      key: "cloud_sync",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = featureFlagBody.safeParse({
      key: "cloud_sync",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty key", () => {
    const result = featureFlagBody.safeParse({
      userId: "user_123",
      key: "",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean enabled", () => {
    const result = featureFlagBody.safeParse({
      userId: "user_123",
      key: "cloud_sync",
      enabled: "yes",
    });
    expect(result.success).toBe(false);
  });
});

describe("grantProBody schema", () => {
  it("accepts valid MONTHLY grant", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "MONTHLY",
      days: 30,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid YEARLY grant", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "YEARLY",
      days: 365,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid interval", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "WEEKLY",
      days: 7,
    });
    expect(result.success).toBe(false);
  });

  it("rejects days < 1", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "MONTHLY",
      days: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects days > 3650", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "MONTHLY",
      days: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fractional days", () => {
    const result = grantProBody.safeParse({
      userId: "user_123",
      interval: "MONTHLY",
      days: 30.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = grantProBody.safeParse({
      interval: "MONTHLY",
      days: 30,
    });
    expect(result.success).toBe(false);
  });
});

describe("revokeProBody schema", () => {
  it("accepts valid input with reason", () => {
    const result = revokeProBody.safeParse({
      userId: "user_123",
      reason: "End of trial",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input without reason", () => {
    const result = revokeProBody.safeParse({
      userId: "user_123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing userId", () => {
    const result = revokeProBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = revokeProBody.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects reason over 500 chars", () => {
    const result = revokeProBody.safeParse({
      userId: "user_123",
      reason: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts reason at exactly 500 chars", () => {
    const result = revokeProBody.safeParse({
      userId: "user_123",
      reason: "x".repeat(500),
    });
    expect(result.success).toBe(true);
  });
});
