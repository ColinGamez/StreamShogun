// ── Health check route ─────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/index.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ok", timestamp: new Date().toISOString() });
    } catch {
      return reply.status(503).send({ status: "error", message: "Database unreachable" });
    }
  });
}
