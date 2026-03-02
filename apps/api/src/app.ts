import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { buildLoggerOptions } from "./config/logger.js";
import { captureError } from "./lib/sentry.js";
import { authRoutes } from "./routes/v1/auth.js";
import { meRoutes } from "./routes/v1/me.js";
import { featuresRoutes } from "./routes/v1/features.js";
import { cloudRoutes } from "./routes/v1/cloud.js";
import { adminRoutes } from "./routes/v1/admin.js";
import { billingRoutes } from "./routes/v1/billing.js";
import { healthRoutes } from "./routes/health.js";

/** Truncate stack traces to avoid flooding log aggregators. */
function safeStack(stack: string | undefined, maxLines = 15): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n");
  if (lines.length <= maxLines) return stack;
  return lines.slice(0, maxLines).join("\n") + `\n  ... (${lines.length - maxLines} more frames)`;
}

export async function buildApp() {
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => crypto.randomUUID(),
    // We handle request/response logging via hooks for richer context
    disableRequestLogging: true,
  });

  // ── Plugins ───────────────────────────────────────────────────

  await app.register(helmet, { global: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // ── Request lifecycle hooks (structured observability) ────────

  app.addHook("onRequest", (request, _reply, done) => {
    // Attach request start time for response-time calculation
    (request as unknown as { _startTime: number })._startTime = performance.now();

    // Skip logging /healthz to avoid noise from Railway health checks
    if (request.url.startsWith("/healthz")) return done();

    request.log.info(
      { reqId: request.id, method: request.method, url: request.url },
      "incoming request",
    );
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    // Skip /healthz
    if (request.url.startsWith("/healthz")) return done();

    const startTime = (request as unknown as { _startTime?: number })._startTime;
    const responseTimeMs = startTime !== undefined && startTime !== null
      ? Math.round(performance.now() - startTime)
      : -1;

    request.log.info(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs,
      },
      "request completed",
    );
    done();
  });

  // ── Routes ────────────────────────────────────────────────────

  // Health check (unversioned)
  await app.register(healthRoutes);

  // v1 API routes
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(meRoutes, { prefix: "/v1/me" });
  await app.register(featuresRoutes, { prefix: "/v1/features" });
  await app.register(cloudRoutes, { prefix: "/v1/cloud" });
  await app.register(adminRoutes, { prefix: "/v1/admin" });
  await app.register(billingRoutes, { prefix: "/v1/billing" });

  // ── Global error handler ──────────────────────────────────────

  app.setErrorHandler((err, request, reply) => {
    const typed = err as Error & { statusCode?: number; validation?: unknown };
    const statusCode = typed.statusCode ?? 500;

    // Structured error log — stack truncated, no secrets
    request.log.error(
      {
        err: {
          message: typed.message,
          stack: safeStack(typed.stack),
          name: typed.name,
          statusCode,
          ...(typed.validation ? { validation: typed.validation } : {}),
        },
        reqId: request.id,
        method: request.method,
        url: request.url,
      },
      `request error: ${typed.message}`,
    );

    // Report 5xx to Sentry
    if (statusCode >= 500) {
      captureError(err as Error, request);
    }

    // Never leak internal details to the client
    reply.code(statusCode).send({
      error: typed.name ?? "InternalServerError",
      message:
        statusCode >= 500 ? "Internal Server Error" : typed.message,
    });
  });

  return app;
}
