import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { adminAuth } from "../../middleware/admin-auth.js";

// ── Shared pagination defaults ──────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

function pagination(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const perPage = Math.min(
    Math.max(Number(query.perPage) || DEFAULT_PER_PAGE, 1),
    MAX_PER_PAGE,
  );
  return { skip: (page - 1) * perPage, take: perPage, page, perPage };
}

// ── Safe user select (never expose secrets) ─────────────────────

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── Plugin ──────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {
  // Apply admin auth to every route in this scope
  app.addHook("preHandler", adminAuth);

  // ── GET /users ──────────────────────────────────────────────

  app.get("/users", async (request, reply) => {
    const { skip, take, page, perPage } = pagination(
      request.query as Record<string, unknown>,
    );

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          ...SAFE_USER_SELECT,
          subscription: {
            select: { plan: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.user.count(),
    ]);

    return reply.send({ data: users, meta: { page, perPage, total } });
  });

  // ── GET /subscriptions ──────────────────────────────────────

  app.get("/subscriptions", async (request, reply) => {
    const { skip, take, page, perPage } = pagination(
      request.query as Record<string, unknown>,
    );

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.subscription.count(),
    ]);

    return reply.send({ data: subscriptions, meta: { page, perPage, total } });
  });

  // ── GET /feature-flags?userId= ─────────────────────────────

  app.get("/feature-flags", async (request, reply) => {
    const { userId } = request.query as { userId?: string };

    if (!userId) {
      return reply
        .code(400)
        .send({ error: "BadRequest", message: "userId query param is required" });
    }

    const flags = await prisma.featureFlag.findMany({
      where: { userId },
      orderBy: { key: "asc" },
    });

    return reply.send({ data: flags });
  });

  // ── PUT /feature-flags ──────────────────────────────────────

  app.put("/feature-flags", async (request, reply) => {
    const { userId, key, enabled } = request.body as {
      userId?: string;
      key?: string;
      enabled?: boolean;
    };

    if (!userId || !key || typeof enabled !== "boolean") {
      return reply.code(400).send({
        error: "BadRequest",
        message: "userId (string), key (string), and enabled (boolean) are required",
      });
    }

    const flag = await prisma.featureFlag.upsert({
      where: { userId_key: { userId, key } },
      update: { enabled },
      create: { userId, key, enabled },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        admin: "founder", // static for now; can be expanded later
        action: "feature-flag.set",
        targetType: "FeatureFlag",
        targetId: flag.id,
        payload: { userId, key, enabled },
      },
    });

    request.log.info(
      { userId, key, enabled, flagId: flag.id },
      "Admin set feature flag",
    );

    return reply.send({ data: flag });
  });

  // ── GET /audit-log ──────────────────────────────────────────

  app.get("/audit-log", async (request, reply) => {
    const { skip, take, page, perPage } = pagination(
      request.query as Record<string, unknown>,
    );

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.auditLog.count(),
    ]);

    return reply.send({ data: entries, meta: { page, perPage, total } });
  });
}
