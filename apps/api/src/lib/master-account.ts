import {
  BillingInterval,
  Plan,
  SubscriptionStatus,
  type SubscriptionDTO,
} from "@stream-shogun/shared";
import { env } from "../config/env.js";

interface SubscriptionRecord {
  plan: string;
  status: string;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
}

export function isMasterEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === env.MASTER_EMAIL?.trim().toLowerCase();
}

export function effectiveSubscription(
  email: string | null | undefined,
  subscription?: SubscriptionRecord | null,
): SubscriptionDTO {
  if (isMasterEmail(email)) {
    return {
      plan: Plan.PRO,
      status: SubscriptionStatus.ACTIVE,
      billingInterval: null,
      currentPeriodEnd: null,
    };
  }

  const billingInterval =
    subscription?.billingInterval === "MONTHLY"
      ? BillingInterval.MONTHLY
      : subscription?.billingInterval === "YEARLY"
        ? BillingInterval.YEARLY
        : null;

  return {
    plan: subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE,
    status: (subscription?.status as SubscriptionStatus) ?? SubscriptionStatus.ACTIVE,
    billingInterval,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
  };
}
