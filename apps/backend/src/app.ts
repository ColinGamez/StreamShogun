// ── Fastify application builder ────────────────────────────────────────

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/index.js";
import {
  authRoutes,
  meRoutes,
  featureRoutes,
  subscriptionRoutes,
  healthRoutes,
} from "./routes/index.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // ── Plugins ─────────────────────────────────────────────────────────

  await app.register(helmet);

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Stricter limit for auth endpoints
    keyGenerator: (req) => req.ip,
  });

  // ── Decorate ────────────────────────────────────────────────────────

  // Make `request.user` available everywhere after jwtVerify
  app.decorateRequest("user", undefined as unknown as string);

  // ── Routes ──────────────────────────────────────────────────────────

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(featureRoutes);
  await app.register(subscriptionRoutes);

  // ── Global error handler ────────────────────────────────────────────

  app.setErrorHandler((err, _request, reply) => {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      app.log.error(error);
    }

    return reply.status(statusCode).send({
      error: error.name ?? "InternalServerError",
      message: statusCode >= 500 ? "Internal server error" : error.message,
      ...(env.NODE_ENV !== "production" && { stack: error.stack }),
    });
  });

  return app;
}
