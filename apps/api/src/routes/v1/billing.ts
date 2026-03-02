import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getStripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  mapStripeStatus,
  derivePlan,
  getInvoiceSubscriptionId,
  extractPeriodEnd,
  extractBillingInterval,
  resolveStripeId,
} from "../../lib/billing-helpers.js";

// ── Request schemas ─────────────────────────────────────────────

const checkoutBody = z.object({
  interval: z.enum(["monthly", "yearly"]),
});

// ── Helpers ─────────────────────────────────────────────────────

/** Return URL base: prefer APP_PUBLIC_URL, fall back to CORS_ORIGIN */
function returnUrlBase(): string {
  return env.APP_PUBLIC_URL ?? env.CORS_ORIGIN.split(",")[0].trim();
}

/**
 * Resolve the price ID for the requested billing interval.
 * Returns null if the required env var is not set.
 */
function priceIdForInterval(interval: "monthly" | "yearly"): string | null {
  return interval === "monthly"
    ? env.STRIPE_PRICE_ID_PRO_MONTHLY ?? null
    : env.STRIPE_PRICE_ID_PRO_YEARLY ?? null;
}

/**
 * Resolve or create a Stripe customer for the given user.
 * Stores `stripeCustomerId` on the subscription row.
 */
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const stripe = getStripe();

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { user: { select: { email: true } } },
  });

  if (!sub) {
    throw new Error(`No subscription row for user ${userId}`);
  }

  if (sub.stripeCustomerId) {
    return sub.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: sub.user.email,
    metadata: { userId },
  });

  await prisma.subscription.update({
    where: { userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// ── Plugin ──────────────────────────────────────────────────────

export async function billingRoutes(app: FastifyInstance) {
  // Rate-limit checkout and portal (not webhooks)
  const billingRateLimit = {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
  };

  // ── POST /checkout ──────────────────────────────────────────

  app.post(
    "/checkout",
    { preHandler: [authenticate], ...billingRateLimit },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: "Billing is not configured" });
      }

      // Validate body
      const parsed = checkoutBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Body must include interval: 'monthly' | 'yearly'",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const { interval } = parsed.data;
      const priceId = priceIdForInterval(interval);

      if (!priceId) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: `Price not configured for ${interval} interval` });
      }

      const stripe = getStripe();
      const { sub } = request.user as { sub: string };

      const customerId = await getOrCreateStripeCustomer(sub);

      const base = returnUrlBase();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${base}/billing/success`,
        cancel_url: `${base}/billing/cancel`,
        subscription_data: { metadata: { userId: sub } },
        metadata: { userId: sub },
      });

      return reply.send({ url: session.url });
    },
  );

  // ── POST /portal ────────────────────────────────────────────

  app.post(
    "/portal",
    { preHandler: [authenticate], ...billingRateLimit },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: "Billing is not configured" });
      }

      const stripe = getStripe();
      const { sub } = request.user as { sub: string };

      const customerId = await getOrCreateStripeCustomer(sub);

      const returnUrl = env.STRIPE_PORTAL_RETURN_URL ?? returnUrlBase();
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return reply.send({ url: portalSession.url });
    },
  );

  // ── POST /webhook ───────────────────────────────────────────
  //
  // Stripe sends the request body as raw bytes. We need to parse
  // the raw body ourselves for signature verification.

  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      return reply
        .code(501)
        .send({ error: "NotImplemented", message: "Webhooks not configured" });
    }

    const stripe = getStripe();
    const sig = request.headers["stripe-signature"];

    if (!sig) {
      return reply.code(400).send({ error: "BadRequest", message: "Missing stripe-signature" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig as string,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      request.log.warn({ err }, "webhook.signature_invalid");
      return reply.code(400).send({ error: "BadRequest", message: "Invalid signature" });
    }

    // Structured context attached to every log line for this event
    const wCtx = { eventId: event.id, eventType: event.type };

    // ── Idempotency: claim via unique constraint on stripeEventId ──

    let webhookEventId: string;
    try {
      const row = await prisma.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "processed",
        },
      });
      webhookEventId = row.id;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        request.log.info({ ...wCtx, outcome: "duplicate_skipped" }, "webhook.duplicate");
        return reply.code(200).send({ received: true });
      }
      throw err; // unexpected DB error → let Stripe retry
    }

    // ── Handle events ───────────────────────────────────────

    let outcome = "processed";
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, request, wCtx);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, request, wCtx);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, request, wCtx);
          break;

        case "invoice.paid":
          await handleInvoicePaid(event.data.object as Stripe.Invoice, request, wCtx);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, request, wCtx);
          break;

        default:
          outcome = "ignored";
          request.log.debug({ ...wCtx, outcome }, "webhook.unhandled");
      }
    } catch (err) {
      outcome = "failed";
      const sanitized = sanitizeError(err);
      request.log.error(
        { ...wCtx, outcome, err: sanitized },
        "webhook.handler_error",
      );

      // Record failure on the WebhookEvent row
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: "failed",
          errorMessage: sanitized.message.slice(0, 500),
        },
      }).catch(() => { /* swallow — don't mask the original error */ });
    }

    // Mark final state
    if (outcome !== "failed") {
      await prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          status: outcome as "processed" | "ignored",
          processedAt: new Date(),
        },
      }).catch(() => { /* swallow */ });
    }

    // Metrics-friendly summary line — one per event, always emitted
    request.log.info({ ...wCtx, outcome }, "webhook.completed");

    return reply.code(200).send({ received: true });
  });
}

// ── Utilities ─────────────────────────────────────────────────────

/** Check if a Prisma error is a unique constraint violation (P2002). */
function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

/** Strip stack traces and large payloads from errors before logging. */
function sanitizeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  return { message: String(err) };
}

/**
 * Verify a Stripe subscription ID belongs to a known user in our DB.
 * Returns the subscription row or null if no match.
 */
async function findSubscriptionByStripeSubId(stripeSubscriptionId: string) {
  return prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
}

// ── Webhook context type ──────────────────────────────────────────
interface WebhookCtx { eventId: string; eventType: string }

/**
 * Stripe statuses that represent incomplete/pending subscriptions.
 * We must NOT flip a user to PRO based on these.
 */
const INCOMPLETE_STATUSES = new Set(["incomplete", "incomplete_expired", "paused"]);

// ── Webhook Handlers ──────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  request: FastifyRequest,
  wCtx: WebhookCtx,
) {
  const userId = session.metadata?.userId;
  if (!userId) {
    request.log.warn(
      { ...wCtx, outcome: "missing_metadata" },
      "webhook.checkout: no userId in metadata",
    );
    return;
  }

  const stripeSubscriptionId = resolveStripeId(session.subscription);
  if (!stripeSubscriptionId) {
    request.log.warn(
      { ...wCtx, outcome: "missing_subscription_id" },
      "webhook.checkout: no subscription ID on session",
    );
    return;
  }

  const customerId = resolveStripeId(session.customer);

  // Ownership: verify userId maps to an existing subscription row
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (!existing) {
    request.log.warn(
      { ...wCtx, outcome: "user_not_found" },
      "webhook.checkout: no subscription row for userId",
    );
    return;
  }

  // Retrieve the Stripe subscription to extract billing interval
  let billingInterval: "MONTHLY" | "YEARLY" | null = null;
  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    billingInterval = extractBillingInterval(stripeSub);
  } catch {
    request.log.warn({ ...wCtx }, "webhook.checkout: could not retrieve subscription for interval");
  }

  await prisma.subscription.update({
    where: { userId },
    data: {
      plan: "PRO",
      status: "ACTIVE",
      billingInterval,
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId,
    },
  });

  request.log.info(
    { ...wCtx, outcome: "activated", plan: "PRO", billingInterval },
    "webhook.checkout: completed",
  );
}

async function handleSubscriptionUpsert(
  sub: Stripe.Subscription,
  request: FastifyRequest,
  wCtx: WebhookCtx,
) {
  // Guard: skip incomplete subscriptions — don't flip plan on partial data
  if (INCOMPLETE_STATUSES.has(sub.status)) {
    request.log.info(
      { ...wCtx, stripeStatus: sub.status, outcome: "skipped_incomplete" },
      "webhook.subscription_upsert: incomplete status, skipping plan change",
    );
    return;
  }

  const mappedStatus = mapStripeStatus(sub.status);
  const plan = derivePlan(mappedStatus);
  const periodEnd = extractPeriodEnd(sub);
  const billingInterval = extractBillingInterval(sub);

  // Primary lookup: by Stripe subscription ID
  let subscription = await findSubscriptionByStripeSubId(sub.id);

  // Fallback: may arrive before checkout.session.completed — try metadata
  if (!subscription) {
    const userId = sub.metadata?.userId;
    if (!userId) {
      request.log.warn(
        { ...wCtx, outcome: "no_owner" },
        "webhook.subscription_upsert: no matching row and no userId metadata",
      );
      return;
    }

    const byUser = await prisma.subscription.findUnique({ where: { userId } });
    if (!byUser) {
      request.log.warn(
        { ...wCtx, outcome: "user_not_found" },
        "webhook.subscription_upsert: userId from metadata not found in DB",
      );
      return;
    }

    subscription = byUser;
  }

  // Ownership: if the subscription already has a customer ID, verify it matches
  const incomingCustomerId = resolveStripeId(sub.customer);
  if (
    subscription.stripeCustomerId &&
    incomingCustomerId &&
    subscription.stripeCustomerId !== incomingCustomerId
  ) {
    request.log.warn(
      { ...wCtx, outcome: "customer_mismatch" },
      "webhook.subscription_upsert: Stripe customer ID does not match DB record",
    );
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      plan,
      status: mappedStatus,
      billingInterval,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd,
    },
  });

  request.log.info(
    { ...wCtx, outcome: "updated", plan, status: mappedStatus, billingInterval },
    "webhook.subscription_upsert: completed",
  );
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  request: FastifyRequest,
  wCtx: WebhookCtx,
) {
  const subscription = await findSubscriptionByStripeSubId(sub.id);

  if (!subscription) {
    request.log.warn(
      { ...wCtx, outcome: "no_matching_row" },
      "webhook.subscription_deleted: no matching subscription",
    );
    return;
  }

  // Ownership: verify customer ID matches if both are present
  const incomingCustomerId = resolveStripeId(sub.customer);
  if (
    subscription.stripeCustomerId &&
    incomingCustomerId &&
    subscription.stripeCustomerId !== incomingCustomerId
  ) {
    request.log.warn(
      { ...wCtx, outcome: "customer_mismatch" },
      "webhook.subscription_deleted: customer ID mismatch, refusing downgrade",
    );
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      plan: "FREE",
      status: "CANCELED",
      billingInterval: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    },
  });

  request.log.info(
    { ...wCtx, outcome: "downgraded", plan: "FREE" },
    "webhook.subscription_deleted: completed",
  );
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  request: FastifyRequest,
  wCtx: WebhookCtx,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    request.log.debug(
      { ...wCtx, outcome: "no_subscription_id" },
      "webhook.invoice_paid: no subscription on invoice, skipping",
    );
    return;
  }

  const subscription = await findSubscriptionByStripeSubId(stripeSubscriptionId);
  if (!subscription) {
    request.log.warn(
      { ...wCtx, outcome: "no_matching_row" },
      "webhook.invoice_paid: subscription not found",
    );
    return;
  }

  // Ownership: verify customer matches
  const incomingCustomerId = resolveStripeId(invoice.customer);
  if (
    subscription.stripeCustomerId &&
    incomingCustomerId &&
    subscription.stripeCustomerId !== incomingCustomerId
  ) {
    request.log.warn(
      { ...wCtx, outcome: "customer_mismatch" },
      "webhook.invoice_paid: customer ID mismatch",
    );
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE" },
  });

  request.log.info(
    { ...wCtx, outcome: "reactivated" },
    "webhook.invoice_paid: completed",
  );
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  request: FastifyRequest,
  wCtx: WebhookCtx,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    request.log.debug(
      { ...wCtx, outcome: "no_subscription_id" },
      "webhook.invoice_failed: no subscription on invoice, skipping",
    );
    return;
  }

  const subscription = await findSubscriptionByStripeSubId(stripeSubscriptionId);
  if (!subscription) {
    request.log.warn(
      { ...wCtx, outcome: "no_matching_row" },
      "webhook.invoice_failed: subscription not found",
    );
    return;
  }

  // Ownership: verify customer matches
  const incomingCustomerId = resolveStripeId(invoice.customer);
  if (
    subscription.stripeCustomerId &&
    incomingCustomerId &&
    subscription.stripeCustomerId !== incomingCustomerId
  ) {
    request.log.warn(
      { ...wCtx, outcome: "customer_mismatch" },
      "webhook.invoice_failed: customer ID mismatch",
    );
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PAST_DUE" },
  });

  request.log.info(
    { ...wCtx, outcome: "marked_past_due" },
    "webhook.invoice_failed: completed",
  );
}
