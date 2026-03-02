import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Plan, SubscriptionStatus, type MeResponse } from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/me ────────────────────────────────────────────────

  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string; email: string };

      const user = await prisma.user.findUnique({
        where: { id: sub },
        include: { subscription: true },
      });

      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }

      const sub_ = user.subscription;

      const response: MeResponse = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? undefined,
          createdAt: user.createdAt.toISOString(),
        },
        subscription: {
          plan: sub_?.plan === "PRO" ? Plan.PRO : Plan.FREE,
          status: (sub_?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
          billingInterval: (sub_?.billingInterval as "MONTHLY" | "YEARLY") ?? null,
          currentPeriodEnd: sub_?.currentPeriodEnd?.toISOString() ?? null,
        },
      };

      return reply.code(200).send(response);
    }
  );
}
