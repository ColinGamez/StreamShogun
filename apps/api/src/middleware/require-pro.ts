import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

/**
 * Fastify preHandler factory — returns a hook that verifies the
 * authenticated user has an active PRO subscription.
 *
 * Usage:  `{ preHandler: [authenticate, requirePro("cloud_sync")] }`
 *
 * On failure, replies with 403 + `{ error, upgrade: true }` so the
 * client can trigger a paywall.
 */
export function requirePro(featureKey: string) {
  return async function requireProHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { sub } = request.user;

    // Single query with include instead of 2 parallel round-trips
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: {
        subscription: true,
        featureFlags: { where: { key: featureKey }, take: 1 },
      },
    });

    const subscription = user?.subscription ?? null;
    const override = user?.featureFlags?.[0] ?? null;

    // Explicit per-user override takes precedence
    if (override) {
      if (override.enabled) return;
      void reply.code(403).send({
        error: "FeatureDisabled",
        message: `Feature "${featureKey}" has been disabled for your account.`,
        upgrade: true,
        featureKey,
      });
      return;
    }

    const isPro = subscription?.plan === "PRO";
    const isActiveOrTrialing =
      subscription?.status === "ACTIVE" ||
      subscription?.status === "TRIALING";

    if (isPro && isActiveOrTrialing) return;

    void reply.code(403).send({
      error: "ProRequired",
      message: `"${featureKey}" requires an active Pro subscription.`,
      upgrade: true,
      featureKey,
    });
  };
}
