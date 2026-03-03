import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { FLAG_KEYS, Plan, SubscriptionStatus, BillingInterval, type FeaturesResponse } from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { env } from "../../config/env.js";

/**
 * Users created before this date are considered "founding members"
 * and may receive special badge / pricing treatment.
 */
const FOUNDING_MEMBER_CUTOFF = new Date(
  env.FOUNDING_MEMBER_CUTOFF ?? "2026-06-01T00:00:00Z",
);

export async function featuresRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/features ──────────────────────────────────────────

  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

      // Single query with includes instead of 3 parallel round-trips
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          createdAt: true,
          subscription: true,
          featureFlags: true,
        },
      });

      const subscription = user?.subscription ?? null;
      const overrides = user?.featureFlags ?? [];

      const plan = subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE;
      const isPro = plan === Plan.PRO;
      const isActive =
        subscription?.status === "ACTIVE" ||
        subscription?.status === "TRIALING";

      // Build override map
      const overrideMap = new Map(overrides.map((f) => [f.key, f.enabled]));

      // Compute effective flags:
      // PRO + (ACTIVE | TRIALING) → all true unless explicitly overridden
      // PRO + PAST_DUE/CANCELED → treat as FREE (no premium features)
      const flags: Record<string, boolean> = {};
      for (const key of FLAG_KEYS) {
        if (overrideMap.has(key)) {
          flags[key] = overrideMap.get(key)!;
        } else {
          flags[key] = isPro && isActive;
        }
      }

      const billingInterval =
        subscription?.billingInterval === "MONTHLY"
          ? BillingInterval.MONTHLY
          : subscription?.billingInterval === "YEARLY"
            ? BillingInterval.YEARLY
            : null;

      // Derive trial end: when status is TRIALING and we have a period end,
      // that period end IS the trial end (Stripe trial_end = period end).
      const isTrial = subscription?.status === "TRIALING";
      const trialEndsAt = isTrial && subscription?.currentPeriodEnd
        ? subscription.currentPeriodEnd.toISOString()
        : null;

      const response: FeaturesResponse = {
        plan,
        subscriptionStatus: (subscription?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
        billingInterval,
        flags,
        currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
        trialEndsAt,
        isFoundingMember: user ? user.createdAt < FOUNDING_MEMBER_CUTOFF : false,
      };
      return reply.code(200).send(response);
    }
  );
}
