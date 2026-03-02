import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { FLAG_KEYS, Plan, SubscriptionStatus, type FeaturesResponse } from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";

export async function featuresRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/features ──────────────────────────────────────────

  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user as { sub: string; email: string };

      const [subscription, overrides] = await Promise.all([
        prisma.subscription.findUnique({ where: { userId: sub } }),
        prisma.featureFlag.findMany({ where: { userId: sub } }),
      ]);

      const plan = subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE;
      const isPro = plan === Plan.PRO;
      const isActive = subscription?.status === "ACTIVE";

      // Build override map
      const overrideMap = new Map(overrides.map((f) => [f.key, f.enabled]));

      // Compute effective flags:
      // PRO + ACTIVE → all true unless explicitly overridden
      // PRO + PAST_DUE/CANCELED → treat as FREE (no premium features)
      const flags: Record<string, boolean> = {};
      for (const key of FLAG_KEYS) {
        if (overrideMap.has(key)) {
          flags[key] = overrideMap.get(key)!;
        } else {
          flags[key] = isPro && isActive;
        }
      }

      const response: FeaturesResponse = {
        plan,
        flags,
        subscription: {
          status: (subscription?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
          currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
        },
      };
      return reply.code(200).send(response);
    }
  );
}
