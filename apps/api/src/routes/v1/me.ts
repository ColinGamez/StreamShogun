import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Plan, SubscriptionStatus, type MeResponse } from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { clearAuthCookies, isWebClient } from "../../lib/cookies.js";
import { authenticate } from "../../middleware/authenticate.js";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/me ────────────────────────────────────────────────

  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

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
          username: user.username ?? undefined,
          displayName: user.displayName ?? undefined,
          createdAt: user.createdAt.toISOString(),
        },
        subscription: {
          plan: sub_?.plan === "PRO" ? Plan.PRO : Plan.FREE,
          status: (sub_?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
          billingInterval: (sub_?.billingInterval as "MONTHLY" | "YEARLY") ?? null,
          currentPeriodEnd: sub_?.currentPeriodEnd?.toISOString() ?? null,
        },
        auth: {
          hasGoogleSignIn: Boolean(user.googleSub),
          hasPasswordLogin: Boolean(user.passwordHash),
        },
      };

      return reply.code(200).send(response);
    },
  );

  // ── DELETE /v1/me ─────────────────────────────────────────────

  app.delete(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

      const user = await prisma.user.findUnique({
        where: { id: sub },
        include: { subscription: true },
      });

      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }

      const managedSubscriptionStatuses = new Set<SubscriptionStatus>([
        SubscriptionStatus.ACTIVE,
        SubscriptionStatus.TRIALING,
        SubscriptionStatus.PAST_DUE,
      ]);
      const hasManagedBilling = Boolean(
        user.subscription?.stripeSubscriptionId || user.subscription?.stripeCustomerId,
      );

      if (
        hasManagedBilling &&
        user.subscription &&
        managedSubscriptionStatuses.has(user.subscription.status as SubscriptionStatus)
      ) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Cancel your Pro subscription in billing before deleting your account.",
        });
      }

      await prisma.$transaction([
        prisma.session.deleteMany({ where: { userId: sub } }),
        prisma.userAchievement.deleteMany({ where: { userId: sub } }),
        prisma.userBadge.deleteMany({ where: { userId: sub } }),
        prisma.profile.deleteMany({ where: { userId: sub } }),
        prisma.appSettingsCloud.deleteMany({ where: { userId: sub } }),
        prisma.featureFlag.deleteMany({ where: { userId: sub } }),
        prisma.subscription.deleteMany({ where: { userId: sub } }),
        prisma.user.delete({ where: { id: sub } }),
      ]);

      if (isWebClient(request)) {
        clearAuthCookies(reply);
      }

      return reply.code(204).send();
    },
  );
}
