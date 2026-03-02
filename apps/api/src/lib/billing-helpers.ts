import type Stripe from "stripe";

// ── Pure mapping functions (exported for unit testing) ───────────

/**
 * Map a Stripe subscription status string to our internal enum.
 *
 * - active → ACTIVE
 * - trialing → TRIALING
 * - past_due / unpaid → PAST_DUE
 * - canceled / incomplete_expired / paused / anything else → CANCELED
 */
export function mapStripeStatus(
  status: string,
): "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    default:
      return "CANCELED";
  }
}

/**
 * Derive plan from subscription status.
 * PRO when ACTIVE or TRIALING; everything else falls back to FREE.
 */
export function derivePlan(
  mappedStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED",
): "PRO" | "FREE" {
  return mappedStatus === "ACTIVE" || mappedStatus === "TRIALING" ? "PRO" : "FREE";
}

/**
 * Extract the Stripe subscription ID from an invoice.
 * In API ≥ 2026-02-25.clover `subscription` moved under
 * `parent.subscription_details`.
 */
export function getInvoiceSubscriptionId(
  invoice: Stripe.Invoice,
): string | null {
  const subRef = invoice.parent?.subscription_details?.subscription;
  if (!subRef) return null;
  return typeof subRef === "string" ? subRef : subRef.id;
}

/**
 * Extract `current_period_end` as a Date from a Stripe subscription.
 * Post-2024 API: lives on `items.data[0].current_period_end`.
 */
export function extractPeriodEnd(sub: Stripe.Subscription): Date | null {
  const epoch = sub.items?.data?.[0]?.current_period_end;
  return epoch ? new Date(epoch * 1000) : null;
}

/**
 * Resolve a Stripe customer or subscription string-or-object to its ID.
 */
export function resolveStripeId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Determine billing interval from Stripe subscription line items.
 * Returns "MONTHLY" | "YEARLY" based on the first price's recurring interval.
 * Falls back to null if the interval cannot be resolved.
 */
export function extractBillingInterval(
  sub: Stripe.Subscription,
): "MONTHLY" | "YEARLY" | null {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "month") return "MONTHLY";
  if (interval === "year") return "YEARLY";
  return null;
}

/**
 * Whether the Stripe subscription status represents an incomplete or
 * pending state where we must NOT activate the subscription.
 *
 * - incomplete: initial payment failed; sub exists but isn't usable
 * - incomplete_expired: timed out waiting for first payment
 * - paused: billing paused by merchant
 */
export function isIncompleteStatus(status: string): boolean {
  return (
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "paused"
  );
}
