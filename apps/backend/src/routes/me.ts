// ── /me route — current user info ─────────────────────────────────────

import type { FastifyInstance } from "fastify";
import { prisma, type AccessTokenPayload } from "../lib/index.js";
import { authenticate } from "../middleware/index.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/me",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sub } = request.user as AccessTokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          id: true,
          email: true,
          createdAt: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              currentPeriodEnd: true,
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user });
    },
  );
}
