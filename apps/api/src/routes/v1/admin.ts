import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { adminAuth } from "../../middleware/admin-auth.js";

// ── Shared pagination ───────────────────────────────────────────

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Parse `page` and `pageSize` (or legacy `perPage`) from query string.
 * Clamps values to safe bounds.
 */
function pagination(query: Record<string, unknown>) {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);
  const raw = Number(query.pageSize) || Number(query.perPage) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(raw, 1), MAX_PAGE_SIZE);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

// ── Safe user select (never expose passwordHash) ────────────────

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ── Request body schemas ────────────────────────────────────────

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

// ── Plugin ──────────────────────────────────────────────────────

export async function adminRoutes(app: FastifyInstance) {
  // Apply admin auth to every route in this scope
  app.addHook("preHandler", adminAuth);

  // ── GET /users ──────────────────────────────────────────────

  app.get("/users", async (request, reply) => {
    const { skip, take, page, pageSize } = pagination(
      request.query as Record<string, unknown>,
    );

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          ...SAFE_USER_SELECT,
          subscription: {
            select: { plan: true, status: true, billingInterval: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.user.count(),
    ]);

    return reply.send({ data: users, meta: { page, pageSize, total } });
  });

  // ── GET /subscriptions ──────────────────────────────────────

  app.get("/subscriptions", async (request, reply) => {
    const { skip, take, page, pageSize } = pagination(
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

    return reply.send({ data: subscriptions, meta: { page, pageSize, total } });
  });

  // ── GET /subscription/:userId ───────────────────────────────

  app.get("/subscription/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };

    if (!userId || typeof userId !== "string") {
      return reply
        .code(400)
        .send({ error: "BadRequest", message: "userId path param is required" });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    if (!subscription) {
      return reply
        .code(404)
        .send({ error: "NotFound", message: "No subscription found for this user" });
    }

    return reply.send({ data: subscription });
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
    const parsed = featureFlagBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "BadRequest",
        message: "userId (string), key (string), and enabled (boolean) are required",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { userId, key, enabled } = parsed.data;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return reply.code(404).send({ error: "NotFound", message: "User not found" });
    }

    const flag = await prisma.featureFlag.upsert({
      where: { userId_key: { userId, key } },
      update: { enabled },
      create: { userId, key, enabled },
    });

    await prisma.auditLog.create({
      data: {
        admin: "founder",
        action: "feature-flag.set",
        targetType: "FeatureFlag",
        targetId: flag.id,
        payload: { userId, key, enabled },
      },
    });

    request.log.info(
      { userId, key, enabled, flagId: flag.id },
      "admin.feature_flag_set",
    );

    return reply.send({ data: flag });
  });

  // ── POST /grant-pro ─────────────────────────────────────────
  //
  // Creates or updates a user's Subscription to ACTIVE PRO without
  // involving Stripe.  Used for alpha testers, support comps, etc.

  app.post("/grant-pro", async (request, reply) => {
    const parsed = grantProBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "BadRequest",
        message: "userId (string), interval (MONTHLY|YEARLY), and days (1–3650) are required",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { userId, interval, days } = parsed.data;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return reply.code(404).send({ error: "NotFound", message: "User not found" });
    }

    const currentPeriodEnd = new Date(Date.now() + days * 86_400_000);

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        plan: "PRO",
        status: "ACTIVE",
        billingInterval: interval,
        currentPeriodEnd,
      },
      create: {
        userId,
        plan: "PRO",
        status: "ACTIVE",
        billingInterval: interval,
        currentPeriodEnd,
      },
    });

    await prisma.auditLog.create({
      data: {
        admin: "founder",
        action: "grant-pro",
        targetType: "Subscription",
        targetId: subscription.id,
        payload: { userId, interval, days, currentPeriodEnd: currentPeriodEnd.toISOString() },
      },
    });

    request.log.info(
      { userId, interval, days, subscriptionId: subscription.id },
      "admin.grant_pro",
    );

    return reply.send({ data: subscription });
  });

  // ── POST /revoke-pro ────────────────────────────────────────
  //
  // Downgrade a user's subscription to FREE. Opposite of grant-pro.

  app.post("/revoke-pro", async (request, reply) => {
    const parsed = revokeProBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "BadRequest",
        message: "userId (string) is required. Optional: reason (string, max 500 chars)",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { userId, reason } = parsed.data;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return reply.code(404).send({ error: "NotFound", message: "User not found" });
    }

    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription) {
      return reply.code(404).send({ error: "NotFound", message: "No subscription found for this user" });
    }

    const previousPlan = subscription.plan;
    const previousStatus = subscription.status;

    const updated = await prisma.subscription.update({
      where: { userId },
      data: {
        plan: "FREE",
        status: "CANCELED",
        billingInterval: null,
        currentPeriodEnd: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        admin: "founder",
        action: "revoke-pro",
        targetType: "Subscription",
        targetId: subscription.id,
        payload: { userId, previousPlan, previousStatus, reason: reason ?? null },
      },
    });

    request.log.info(
      { userId, previousPlan, previousStatus, subscriptionId: subscription.id },
      "admin.revoke_pro",
    );

    return reply.send({ data: updated });
  });

  // ── GET /audit-log ──────────────────────────────────────────

  app.get("/audit-log", async (request, reply) => {
    const { skip, take, page, pageSize } = pagination(
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

    return reply.send({ data: entries, meta: { page, pageSize, total } });
  });
}
