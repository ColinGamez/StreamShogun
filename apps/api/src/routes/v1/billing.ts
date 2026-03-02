import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type Stripe from "stripe";
import { prisma } from "../../lib/prisma.js";
import { getStripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";

// ── Helpers ─────────────────────────────────────────────────────

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

/**
 * Map a Stripe subscription status string to our enum.
 */
function mapStripeStatus(
  status: string,
): "ACTIVE" | "PAST_DUE" | "CANCELED" {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    default:
      return "CANCELED";
  }
}

// ── Plugin ──────────────────────────────────────────────────────

export async function billingRoutes(app: FastifyInstance) {
  // ── POST /checkout ──────────────────────────────────────────

  app.post(
    "/checkout",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: "Billing is not configured" });
      }

      const stripe = getStripe();
      const { sub } = request.user as { sub: string };

      const customerId = await getOrCreateStripeCustomer(sub);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${env.CORS_ORIGIN}/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CORS_ORIGIN}/billing?canceled=1`,
        subscription_data: { metadata: { userId: sub } },
        metadata: { userId: sub },
      });

      return reply.send({ url: session.url });
    },
  );

  // ── POST /portal ────────────────────────────────────────────

  app.post(
    "/portal",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return reply
          .code(501)
          .send({ error: "NotImplemented", message: "Billing is not configured" });
      }

      const stripe = getStripe();
      const { sub } = request.user as { sub: string };

      const customerId = await getOrCreateStripeCustomer(sub);

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${env.CORS_ORIGIN}/billing`,
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
      // Attach raw buffer for webhook signature verification
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
      request.log.warn({ err }, "Stripe webhook signature verification failed");
      return reply.code(400).send({ error: "BadRequest", message: "Invalid signature" });
    }

    // ── Idempotency check ───────────────────────────────────

    const existing = await prisma.processedEvent.findUnique({
      where: { id: event.id },
    });

    if (existing) {
      request.log.info({ eventId: event.id }, "Duplicate Stripe event, skipping");
      return reply.code(200).send({ received: true });
    }

    // ── Handle events ───────────────────────────────────────

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, request);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, request);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, request);
          break;

        case "invoice.paid":
          await handleInvoicePaid(event.data.object as Stripe.Invoice, request);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, request);
          break;

        default:
          request.log.debug({ type: event.type }, "Unhandled Stripe event type");
      }
    } catch (err) {
      request.log.error({ err, eventId: event.id, type: event.type }, "Error processing Stripe event");
      // Still mark processed to avoid infinite retries on bad data
    }

    // Mark event as processed
    await prisma.processedEvent.create({ data: { id: event.id } });

    return reply.code(200).send({ received: true });
  });
}

// ── Webhook Handlers ──────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  request: FastifyRequest,
) {
  const userId = session.metadata?.userId;
  if (!userId) {
    request.log.warn({ sessionId: session.id }, "checkout.session.completed missing userId metadata");
    return;
  }

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!stripeSubscriptionId) return;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  await prisma.subscription.update({
    where: { userId },
    data: {
      plan: "PRO",
      status: "ACTIVE",
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId,
    },
  });

  request.log.info({ userId, stripeSubscriptionId }, "Checkout completed → PRO");
}

async function handleSubscriptionUpsert(
  sub: Stripe.Subscription,
  request: FastifyRequest,
) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  });

  if (!subscription) {
    // May arrive before checkout.session.completed — try metadata
    const userId = sub.metadata?.userId;
    if (!userId) {
      request.log.warn({ stripeSubId: sub.id }, "subscription.upsert: no matching row and no userId metadata");
      return;
    }
    await prisma.subscription.update({
      where: { userId },
      data: {
        plan: "PRO",
        status: mapStripeStatus(sub.status),
        stripeSubscriptionId: sub.id,
        currentPeriodEnd: sub.items.data[0]?.current_period_end
          ? new Date(sub.items.data[0].current_period_end * 1000)
          : null,
      },
    });
    request.log.info({ userId, status: sub.status }, "Subscription upserted via metadata");
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: mapStripeStatus(sub.status),
      currentPeriodEnd: sub.items.data[0]?.current_period_end
        ? new Date(sub.items.data[0].current_period_end * 1000)
        : null,
    },
  });

  request.log.info(
    { subId: subscription.id, status: sub.status },
    "Subscription updated",
  );
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  request: FastifyRequest,
) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: sub.id },
  });

  if (!subscription) {
    request.log.warn({ stripeSubId: sub.id }, "subscription.deleted: no matching row");
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      plan: "FREE",
      status: "CANCELED",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
    },
  });

  request.log.info({ subId: subscription.id }, "Subscription deleted → FREE");
}

/**
 * Extract the Stripe subscription ID from an invoice.
 * In API 2026-02-25.clover, subscription moved to parent.subscription_details.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subRef = invoice.parent?.subscription_details?.subscription;
  if (!subRef) return null;
  return typeof subRef === "string" ? subRef : subRef.id;
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  request: FastifyRequest,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE" },
  });

  request.log.info({ subId: subscription.id }, "Invoice paid → ACTIVE");
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  request: FastifyRequest,
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
  });

  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PAST_DUE" },
  });

  request.log.info({ subId: subscription.id }, "Invoice payment failed → PAST_DUE");
}
