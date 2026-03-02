import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { HealthResponse } from "@stream-shogun/shared";
import { prisma } from "../lib/prisma.js";
import { isSentryEnabled } from "../lib/sentry.js";
import { env } from "../config/env.js";

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /healthz ──────────────────────────────────────────────

  app.get(
    "/healthz",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      let dbOk = false;
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbOk = true;
      } catch (err) {
        _request.log.error({ err }, "healthz: database ping failed");
      }

      const stripeKeyConfigured = !!env.STRIPE_SECRET_KEY;
      const billingEnabled =
        stripeKeyConfigured && env.BILLING_DISABLED !== "true";

      const response: HealthResponse = {
        status: dbOk ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        db: dbOk,
        stripeKeyConfigured,
        billingEnabled,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        version: process.env.npm_package_version ?? "0.0.0",
      };

      return reply.code(dbOk ? 200 : 503).send(response);
    }
  );

  // ── GET /healthz/details (internal — more verbose) ────────────

  app.get(
    "/healthz/details",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      let dbOk = false;
      let dbLatencyMs = -1;
      try {
        const t0 = performance.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatencyMs = Math.round(performance.now() - t0);
        dbOk = true;
      } catch (err) {
        _request.log.error({ err }, "healthz/details: database ping failed");
      }

      return reply.code(dbOk ? 200 : 503).send({
        status: dbOk ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        version: process.env.npm_package_version ?? "0.0.0",
        node: process.version,
        memory: process.memoryUsage(),
        db: { ok: dbOk, latencyMs: dbLatencyMs },
        sentry: isSentryEnabled(),
      });
    }
  );
}
