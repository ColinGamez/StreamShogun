// ── /subscription route — user subscription info ──────────────────────

import type { FastifyInstance } from "fastify";
import { prisma, type AccessTokenPayload } from "../lib/index.js";
import { authenticate } from "../middleware/index.js";

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /subscription ───────────────────────────────────────────────
  app.get(
    "/subscription",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sub } = request.user as AccessTokenPayload;

      const subscription = await prisma.subscription.findUnique({
        where: { userId: sub },
      });

      if (!subscription) {
        return reply.send({
          plan: "free",
          status: "active",
          stripeCustomerId: null,
          currentPeriodEnd: null,
        });
      }

      return reply.send({
        plan: subscription.plan,
        status: subscription.status,
        stripeCustomerId: subscription.stripeCustomerId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        createdAt: subscription.createdAt,
      });
    },
  );
}
