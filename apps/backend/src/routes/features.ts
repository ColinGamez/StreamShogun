// ── /features route — user's feature flags ────────────────────────────

import type { FastifyInstance } from "fastify";
import { prisma, type AccessTokenPayload } from "../lib/index.js";
import { authenticate } from "../middleware/index.js";

export async function featureRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /features ───────────────────────────────────────────────────
  app.get(
    "/features",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { sub } = request.user as AccessTokenPayload;

      const flags = await prisma.featureFlag.findMany({
        where: { userId: sub },
        select: { flagName: true, enabled: true },
      });

      // Also fetch subscription to compute effective feature access
      const subscription = await prisma.subscription.findUnique({
        where: { userId: sub },
        select: { plan: true, status: true },
      });

      const isPro =
        subscription?.plan === "pro" && subscription.status === "active";

      // Effective flags: enabled in DB OR user has active pro subscription
      const features = flags.map((f) => ({
        flag: f.flagName,
        enabled: f.enabled || isPro,
        source: isPro ? ("plan" as const) : f.enabled ? ("override" as const) : ("default" as const),
      }));

      return reply.send({ features, plan: subscription?.plan ?? "free", isPro });
    },
  );
}
