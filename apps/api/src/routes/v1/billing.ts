import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getStripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { captureError } from "../../lib/sentry.js";
import {
  mapStripeStatus,
  derivePlan,
  getInvoiceSubscriptionId,
  extractPeriodEnd,
  extractBillingInterval,
  resolveStripeId,
  isIncompleteStatus,
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
  // ── Kill-switch: BILLING_DISABLED=true → 503 all billing ──────
  const billingDisabled = env.BILLING_DISABLED === "true";

  // Rate-limit checkout and portal (not webhooks)
  const billingRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute",
      },
    },
  };

  // ── POST /checkout ──────────────────────────────────────────

  app.post(
    "/checkout",
    { preHandler: [authenticate], ...billingRateLimit },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (billingDisabled) {
        return reply
          .code(503)
          .send({ error: "ServiceUnavailable", message: "Billing is temporarily disabled" });
      }

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
      const { sub } = request.user;

      const customerId = await getOrCreateStripeCustomer(sub);

      const base = returnUrlBase();

      // Determine if this user qualifies for a free trial.
      // Only first-time subscribers (never had a Stripe subscription) get a trial.
      const existingSub = await prisma.subscription.findUnique({ where: { userId: sub } });
      const isFirstSubscription = !existingSub?.stripeSubscriptionId;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${base}/billing/success`,
        cancel_url: `${base}/billing/cancel`,
        subscription_data: {
          metadata: { userId: sub },
          ...(isFirstSubscription ? { trial_period_days: 7 } : {}),
        },
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
      if (billingDisabled) {
        return reply
          .code(503)
          .send({ error: "ServiceUnavailable", message: "Billing is temporarily disabled" });
      }

      if (!env.STRIPE_SECRET_KEY) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: "Billing is not configured" });
      }

      const stripe = getStripe();
      const { sub } = request.user;

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
    const wCtx: WebhookCtx = { eventId: event.id, eventType: event.type };

    // ── Kill-switch: accept event but skip processing ───────────
    if (billingDisabled) {
      await prisma.webhookEvent.upsert({
        where: { stripeEventId: event.id },
        update: { status: "ignored", errorMessage: "billing_disabled", processedAt: new Date() },
        create: {
          stripeEventId: event.id,
          type: event.type,
          status: "ignored",
          errorMessage: "billing_disabled",
          processedAt: new Date(),
        },
      }).catch(() => { /* non-fatal */ });
      request.log.info({ ...wCtx, outcome: "ignored", reason: "billing_disabled" }, "webhook.billing_disabled");
      return reply.code(200).send({ received: true });
    }

    // ── Idempotency: fast-path for already-handled events ───────

    const prior = await prisma.webhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { id: true, status: true },
    });

    if (prior) {
      if (prior.status === "processed" || prior.status === "ignored") {
        request.log.info(
          { ...wCtx, outcome: "duplicate_skipped", priorStatus: prior.status },
          "webhook.duplicate",
        );
        return reply.code(200).send({ received: true });
      }
      // Prior attempt failed or crashed ("failed" / "processing") — allow retry
      await prisma.webhookEvent.delete({ where: { id: prior.id } }).catch(() => { /* retry cleanup — non-fatal */ });
    }

    // ── Idempotency: claim via unique constraint (race-safe) ────

    let webhookEventId: string;
    try {
      const row = await prisma.webhookEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
          status: "processing",
        },
      });
      webhookEventId = row.id;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        request.log.info({ ...wCtx, outcome: "duplicate_race" }, "webhook.duplicate");
        return reply.code(200).send({ received: true });
      }
      throw err; // unexpected DB error → let Stripe retry
    }

    // ── Dispatch to handler ─────────────────────────────────

    let result: HandlerResult;
    try {
      switch (event.type) {
        case "checkout.session.completed":
          result = await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session, webhookEventId, wCtx, request.log,
          );
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          result = await handleSubscriptionUpsert(
            event.data.object as Stripe.Subscription, webhookEventId, wCtx, request.log,
          );
          break;

        case "customer.subscription.deleted":
          result = await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription, webhookEventId, wCtx, request.log,
          );
          break;

        case "invoice.paid":
          result = await handleInvoicePaid(
            event.data.object as Stripe.Invoice, webhookEventId, wCtx, request.log,
          );
          break;

        case "invoice.payment_failed":
          result = await handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice, webhookEventId, wCtx, request.log,
          );
          break;

        default:
          result = { outcome: "ignored", reason: "unhandled_event_type" };
          await prisma.webhookEvent
            .update({
              where: { id: webhookEventId },
              data: { status: "ignored", errorMessage: "unhandled_event_type", processedAt: new Date() },
            })
            .catch((err) => { request.log.warn({ err }, "webhook: failed to record ignored event"); });
      }
    } catch (err) {
      const sanitized = sanitizeError(err);
      request.log.error(
        { ...wCtx, outcome: "failed", err: sanitized },
        "webhook.handler_error",
      );
      // Report unhandled webhook errors to Sentry (if configured)
      captureError(err instanceof Error ? err : new Error(sanitized.message), request);
      await prisma.webhookEvent
        .update({
          where: { id: webhookEventId },
          data: {
            status: "failed",
            errorMessage: sanitized.message.slice(0, 500),
            processedAt: new Date(),
          },
        })
        .catch((dbErr) => { request.log.warn({ err: dbErr }, "webhook: failed to record handler error"); });
      // Return 200 — failure is recorded; Stripe should not retry
      return reply.code(200).send({ received: true });
    }

    // ── Stripe failure metrics (structured log counters) ─────────
    if (event.type === "invoice.payment_failed") {
      request.log.warn(
        { ...wCtx, metric: "stripe.invoice_payment_failed" },
        "stripe.metric: invoice.payment_failed",
      );
    }
    if (event.type === "customer.subscription.deleted") {
      request.log.warn(
        { ...wCtx, metric: "stripe.subscription_deleted" },
      "stripe.metric: subscription.deleted",
      );
    }

    request.log.info(
      { ...wCtx, outcome: result.outcome, ...(result.reason && { reason: result.reason }) },
      "webhook.completed",
    );

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

// ── Webhook context type ──────────────────────────────────────────
interface WebhookCtx { eventId: string; eventType: string }

/** Structured return from each event handler for outcome tracking. */
interface HandlerResult {
  outcome: "processed" | "ignored";
  reason?: string;
}

/**
 * Record a webhook event outcome for pre-transaction early returns
 * (e.g. missing metadata, incomplete status) and return the result.
 */
async function recordAndReturn(
  webhookEventId: string,
  result: HandlerResult,
): Promise<HandlerResult> {
  await prisma.webhookEvent
    .update({
      where: { id: webhookEventId },
      data: {
        status: result.outcome,
        errorMessage: result.reason?.slice(0, 500) ?? null,
        processedAt: new Date(),
      },
    })
    .catch((err) => { console.warn("webhook: recordAndReturn update failed", err); });
  return result;
}

// ── Webhook Handlers ──────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  webhookEventId: string,
  wCtx: WebhookCtx,
  log: FastifyBaseLogger,
): Promise<HandlerResult> {
  const userId = session.metadata?.userId;
  if (!userId) {
    log.warn({ ...wCtx, reason: "missing_metadata" }, "webhook.checkout: no userId in metadata");
    return recordAndReturn(webhookEventId, { outcome: "ignored", reason: "missing_metadata" });
  }

  const stripeSubscriptionId = resolveStripeId(session.subscription);
  if (!stripeSubscriptionId) {
    log.warn(
      { ...wCtx, reason: "missing_subscription_id" },
      "webhook.checkout: no subscription ID on session",
    );
    return recordAndReturn(webhookEventId, { outcome: "ignored", reason: "missing_subscription_id" });
  }

  const customerId = resolveStripeId(session.customer);

  // Fetch billing interval from Stripe outside the transaction to avoid long row locks
  let billingInterval: "MONTHLY" | "YEARLY" | null = null;
  try {
    const stripe = getStripe();
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    billingInterval = extractBillingInterval(stripeSub);
  } catch {
    log.warn({ ...wCtx }, "webhook.checkout: could not retrieve subscription for interval");
  }

  return prisma.$transaction<HandlerResult>(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { userId } });
    if (!existing) {
      log.warn({ ...wCtx, reason: "user_not_found" }, "webhook.checkout: no subscription row");
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "user_not_found", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "user_not_found" };
    }

    // Ownership: verify customer ID matches if both are set
    if (
      existing.stripeCustomerId &&
      customerId &&
      existing.stripeCustomerId !== customerId
    ) {
      log.warn(
        { ...wCtx, reason: "customer_mismatch" },
        "webhook.checkout: customer ID mismatch",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "customer_mismatch", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "customer_mismatch" };
    }

    await tx.subscription.update({
      where: { userId },
      data: {
        plan: "PRO",
        status: "ACTIVE",
        billingInterval,
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId,
      },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "processed", processedAt: new Date() },
    });

    return { outcome: "processed" };
  });
}

async function handleSubscriptionUpsert(
  sub: Stripe.Subscription,
  webhookEventId: string,
  wCtx: WebhookCtx,
  log: FastifyBaseLogger,
): Promise<HandlerResult> {
  // Guard: skip incomplete subscriptions — don't activate on partial data
  if (isIncompleteStatus(sub.status)) {
    log.info(
      { ...wCtx, stripeStatus: sub.status, reason: "incomplete_status" },
      "webhook.subscription_upsert: incomplete status, skipping",
    );
    return recordAndReturn(webhookEventId, { outcome: "ignored", reason: `incomplete_status:${sub.status}` });
  }

  const mappedStatus = mapStripeStatus(sub.status);
  const plan = derivePlan(mappedStatus);
  const periodEnd = extractPeriodEnd(sub);
  const billingInterval = extractBillingInterval(sub);
  const incomingCustomerId = resolveStripeId(sub.customer);

  return prisma.$transaction<HandlerResult>(async (tx) => {
    // Primary lookup: by Stripe subscription ID
    let subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    });

    // Fallback: may arrive before checkout.session.completed — try metadata
    if (!subscription) {
      const userId = sub.metadata?.userId;
      if (!userId) {
        log.warn(
          { ...wCtx, reason: "no_owner" },
          "webhook.subscription_upsert: no matching row and no userId metadata",
        );
        await tx.webhookEvent.update({
          where: { id: webhookEventId },
          data: { status: "ignored", errorMessage: "no_owner", processedAt: new Date() },
        });
        return { outcome: "ignored", reason: "no_owner" };
      }
      subscription = await tx.subscription.findUnique({ where: { userId } });
      if (!subscription) {
        log.warn(
          { ...wCtx, reason: "user_not_found" },
          "webhook.subscription_upsert: userId from metadata not found",
        );
        await tx.webhookEvent.update({
          where: { id: webhookEventId },
          data: { status: "ignored", errorMessage: "user_not_found", processedAt: new Date() },
        });
        return { outcome: "ignored", reason: "user_not_found" };
      }
    }

    // Ownership: verify customer ID matches
    if (
      subscription.stripeCustomerId &&
      incomingCustomerId &&
      subscription.stripeCustomerId !== incomingCustomerId
    ) {
      log.warn(
        { ...wCtx, reason: "customer_mismatch" },
        "webhook.subscription_upsert: customer ID mismatch",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "customer_mismatch", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "customer_mismatch" };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        plan,
        status: mappedStatus,
        billingInterval,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "processed", processedAt: new Date() },
    });

    return { outcome: "processed" };
  });
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  webhookEventId: string,
  wCtx: WebhookCtx,
  log: FastifyBaseLogger,
): Promise<HandlerResult> {
  const incomingCustomerId = resolveStripeId(sub.customer);

  return prisma.$transaction<HandlerResult>(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    });

    if (!subscription) {
      log.warn(
        { ...wCtx, reason: "no_matching_row" },
        "webhook.subscription_deleted: no matching subscription",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "no_matching_row", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "no_matching_row" };
    }

    // Ownership: verify customer ID matches
    if (
      subscription.stripeCustomerId &&
      incomingCustomerId &&
      subscription.stripeCustomerId !== incomingCustomerId
    ) {
      log.warn(
        { ...wCtx, reason: "customer_mismatch" },
        "webhook.subscription_deleted: customer ID mismatch",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "customer_mismatch", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "customer_mismatch" };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: "FREE",
        status: "CANCELED",
        billingInterval: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "processed", processedAt: new Date() },
    });

    return { outcome: "processed" };
  });
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  webhookEventId: string,
  wCtx: WebhookCtx,
  log: FastifyBaseLogger,
): Promise<HandlerResult> {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    log.debug(
      { ...wCtx, reason: "no_subscription_id" },
      "webhook.invoice_paid: no subscription on invoice, skipping",
    );
    return recordAndReturn(webhookEventId, { outcome: "ignored", reason: "no_subscription_id" });
  }

  const incomingCustomerId = resolveStripeId(invoice.customer);

  return prisma.$transaction<HandlerResult>(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      log.warn(
        { ...wCtx, reason: "no_matching_row" },
        "webhook.invoice_paid: subscription not found",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "no_matching_row", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "no_matching_row" };
    }

    // Ownership: verify customer matches
    if (
      subscription.stripeCustomerId &&
      incomingCustomerId &&
      subscription.stripeCustomerId !== incomingCustomerId
    ) {
      log.warn(
        { ...wCtx, reason: "customer_mismatch" },
        "webhook.invoice_paid: customer ID mismatch",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "customer_mismatch", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "customer_mismatch" };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE" },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "processed", processedAt: new Date() },
    });

    return { outcome: "processed" };
  });
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  webhookEventId: string,
  wCtx: WebhookCtx,
  log: FastifyBaseLogger,
): Promise<HandlerResult> {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    log.debug(
      { ...wCtx, reason: "no_subscription_id" },
      "webhook.invoice_failed: no subscription on invoice, skipping",
    );
    return recordAndReturn(webhookEventId, { outcome: "ignored", reason: "no_subscription_id" });
  }

  const incomingCustomerId = resolveStripeId(invoice.customer);

  return prisma.$transaction<HandlerResult>(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      log.warn(
        { ...wCtx, reason: "no_matching_row" },
        "webhook.invoice_failed: subscription not found",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "no_matching_row", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "no_matching_row" };
    }

    // Ownership: verify customer matches
    if (
      subscription.stripeCustomerId &&
      incomingCustomerId &&
      subscription.stripeCustomerId !== incomingCustomerId
    ) {
      log.warn(
        { ...wCtx, reason: "customer_mismatch" },
        "webhook.invoice_failed: customer ID mismatch",
      );
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: "ignored", errorMessage: "customer_mismatch", processedAt: new Date() },
      });
      return { outcome: "ignored", reason: "customer_mismatch" };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE" },
    });

    await tx.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "processed", processedAt: new Date() },
    });

    return { outcome: "processed" };
  });
}
