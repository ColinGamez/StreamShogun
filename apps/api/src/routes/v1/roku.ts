// ── Roku EPG proxy route ─────────────────────────────────────────
// GET /v1/roku/epg?url=<encoded-url>
//
// Fetches a user-provided XMLTV URL, decompresses .xml.gz if needed,
// and returns plain UTF-8 XML. PRO-gated with SSRF protections.

import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/index.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePro } from "../../middleware/require-pro.js";
import { validateEpgUrl, redactUrl } from "../../lib/epg-url-validator.js";
import { processEpgBuffer } from "../../lib/epg-gzip.js";
import { epgCache } from "../../lib/epg-cache.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";

/** Upstream fetch timeouts. */
const OVERALL_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 5;

const validatePurchaseBody = z.object({
  purchaseId: z.string().min(1).max(1024),
  productCode: z.string().min(1).max(128),
});

const rokuPayNotificationBody = z
  .object({
    responseKey: z.string().min(1).max(1024),
    transactionType: z.string().min(1).max(96).optional(),
    transactionId: z.string().min(1).max(1024).optional(),
    originalTransactionId: z.string().min(1).max(1024).optional(),
    customerId: z.string().min(1).max(256).optional(),
    productCode: z.string().min(1).max(128).optional(),
    eventDate: z.string().min(1).max(128).optional(),
    expirationDate: z.string().min(1).max(128).optional(),
  })
  .passthrough();

type RokuPayNotification = z.infer<typeof rokuPayNotificationBody>;
type RokuPayPushAction =
  | "activate"
  | "keep_active"
  | "cancel"
  | "cancel_at_period_end"
  | "metadata_only";

export async function rokuRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /v1/roku/pay-push ──────────────────────────────────
  // Roku Pay notifications are unauthenticated by design. Roku requires
  // the publisher listener to echo the responseKey and ApiKey header.
  app.post(
    "/pay-push",
    {
      config: {
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = rokuPayNotificationBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Body must include a Roku Pay responseKey.",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      if (!env.ROKU_PAY_API_KEY) {
        return reply.code(501).send({
          error: "NotImplemented",
          message: "Roku Pay push notifications are not configured.",
        });
      }

      try {
        await handleRokuPayNotification(parsed.data, request.log);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Roku Pay push processing failed.";
        request.log.error({ err: message }, "roku.pay_push.failed");
        return reply.code(500).send({
          error: "InternalServerError",
          message: "Roku Pay push processing failed.",
        });
      }

      return reply
        .code(200)
        .header("ApiKey", env.ROKU_PAY_API_KEY)
        .type("text/plain")
        .send(parsed.data.responseKey);
    },
  );

  // ── POST /v1/roku/validate-purchase ─────────────────────────
  app.post(
    "/validate-purchase",
    {
      preHandler: [authenticate],
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 hour",
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = validatePurchaseBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Body must include purchaseId and productCode.",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      if (!env.ROKU_PAY_API_KEY) {
        return reply.code(501).send({
          error: "NotImplemented",
          message: "Roku Pay validation is not configured.",
        });
      }

      const knownProducts = [
        env.ROKU_PRODUCT_ID_PRO_MONTHLY,
        env.ROKU_PRODUCT_ID_PRO_YEARLY,
      ].filter(Boolean);

      if (knownProducts.length === 0) {
        return reply.code(501).send({
          error: "NotImplemented",
          message: "Roku Pro product IDs are not configured.",
        });
      }

      const { purchaseId, productCode } = parsed.data;
      if (!knownProducts.includes(productCode)) {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Unknown Roku Pay product code.",
        });
      }

      let validation: Record<string, unknown>;
      try {
        validation = await validateRokuPayTransaction(purchaseId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Roku Pay validation failed.";
        request.log.error({ err: message }, "roku.validate_purchase.failed");
        return reply.code(502).send({
          error: "BadGateway",
          message,
        });
      }

      if (!isRokuEntitled(validation)) {
        return reply.code(403).send({
          error: "NotEntitled",
          message: "Roku Pay did not confirm this purchase as entitled.",
          entitled: false,
          validation,
        });
      }

      const billingInterval = productCode === env.ROKU_PRODUCT_ID_PRO_YEARLY ? "YEARLY" : "MONTHLY";
      const currentPeriodEnd = extractRokuExpiration(validation);
      const rokuTransactionId =
        readRokuString(validation, [
          "transactionId",
          "transaction_id",
          "purchaseId",
          "purchase_id",
        ]) ?? purchaseId;
      const rokuOriginalTransactionId = readRokuString(validation, [
        "originalTransactionId",
        "original_transaction_id",
      ]);
      const rokuCustomerId = readRokuString(validation, ["customerId", "customer_id"]);

      await prisma.subscription.upsert({
        where: { userId: request.user.sub },
        create: {
          userId: request.user.sub,
          plan: "PRO",
          status: "ACTIVE",
          billingInterval,
          rokuCustomerId,
          rokuTransactionId,
          rokuOriginalTransactionId,
          rokuProductCode: productCode,
          rokuLastEventType: "validate-purchase",
          currentPeriodEnd,
        },
        update: {
          plan: "PRO",
          status: "ACTIVE",
          billingInterval,
          rokuCustomerId,
          rokuTransactionId,
          rokuOriginalTransactionId,
          rokuProductCode: productCode,
          rokuLastEventType: "validate-purchase",
          currentPeriodEnd,
        },
      });

      return reply.code(200).send({
        ok: true,
        entitled: true,
        purchaseId,
        productCode,
        subscription: {
          plan: "PRO",
          status: "ACTIVE",
          billingInterval,
          currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
        },
      });
    },
  );

  // ── GET /v1/roku/epg ─────────────────────────────────────────
  app.get(
    "/epg",
    {
      preHandler: [authenticate, requirePro("epg_proxy")],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 hour",
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const rawUrl = (request.query as Record<string, string | undefined>).url;

      // ── 1. Validate URL (SSRF protection) ──────────────────
      const validation = await validateEpgUrl(rawUrl);
      if (!validation.ok) {
        request.log.warn({ reason: validation.reason }, "EPG proxy: URL rejected");
        return reply.code(400).send({
          error: "BadRequest",
          message: validation.reason,
        });
      }

      const targetUrl = validation.url.href;
      const safeLogUrl = redactUrl(targetUrl);

      // ── 2. Check cache (ETag / If-None-Match) ─────────────
      const cached = epgCache.get(targetUrl);
      if (cached) {
        const clientEtag = request.headers["if-none-match"];
        if (clientEtag && clientEtag === cached.etag) {
          return reply.code(304).send();
        }
        request.log.info({ url: safeLogUrl }, "EPG proxy: cache hit");
        return reply
          .code(200)
          .header("Content-Type", "application/xml; charset=utf-8")
          .header("Cache-Control", "private, max-age=3600")
          .header("ETag", cached.etag)
          .header("X-Cache", "HIT")
          .send(cached.xml);
      }

      // ── 3. Fetch upstream ──────────────────────────────────
      request.log.info({ url: safeLogUrl }, "EPG proxy: fetching upstream");

      let buffer: Buffer;
      try {
        buffer = await fetchWithLimits(targetUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upstream fetch failed";
        const isTimeout = message.includes("timeout") || message.includes("abort");
        const code = isTimeout ? 504 : 502;

        request.log.error({ url: safeLogUrl, err: message }, "EPG proxy: upstream error");
        return reply.code(code).send({
          error: code === 504 ? "GatewayTimeout" : "BadGateway",
          message: `Failed to fetch EPG: ${message}`,
        });
      }

      // ── 4. Process (gzip detect + decompress + validate) ──
      const result = await processEpgBuffer(targetUrl, buffer);
      if (!result.ok) {
        request.log.warn({ url: safeLogUrl, reason: result.reason }, "EPG proxy: invalid response");
        return reply.code(502).send({
          error: "BadGateway",
          message: result.reason,
        });
      }

      // ── 5. Cache + respond ─────────────────────────────────
      const entry = epgCache.set(targetUrl, result.xml);

      request.log.info(
        { url: safeLogUrl, sizeKb: Math.round(result.xml.length / 1024) },
        "EPG proxy: success",
      );

      return reply
        .code(200)
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Cache-Control", "private, max-age=3600")
        .header("ETag", entry.etag)
        .header("X-Cache", "MISS")
        .send(result.xml);
    },
  );
}

// ── Roku Pay push notification handling ───────────────────────────

async function handleRokuPayNotification(
  notification: RokuPayNotification,
  log: FastifyBaseLogger,
): Promise<void> {
  const transactionId = notification.transactionId ?? notification.responseKey;
  const transactionType = notification.transactionType ?? "Unknown";

  const prior = await prisma.rokuPayEvent.findUnique({
    where: { transactionId },
    select: { id: true, status: true },
  });

  if (prior?.status === "processed" || prior?.status === "ignored") {
    log.info(
      { transactionId, transactionType, outcome: "duplicate_skipped", priorStatus: prior.status },
      "roku.pay_push.duplicate",
    );
    return;
  }

  if (prior) {
    await prisma.rokuPayEvent.delete({ where: { id: prior.id } }).catch(() => {
      // A parallel retry may have claimed it. Treat the original as good enough.
    });
  }

  let eventId: string;
  try {
    const event = await prisma.rokuPayEvent.create({
      data: {
        transactionId,
        originalTransactionId: notification.originalTransactionId ?? null,
        customerId: notification.customerId ?? null,
        productCode: notification.productCode ?? null,
        type: transactionType,
        status: "processing",
        payload: notification as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    eventId = event.id;
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      log.info(
        { transactionId, transactionType, outcome: "duplicate_race" },
        "roku.pay_push.duplicate",
      );
      return;
    }
    throw err;
  }

  try {
    await processRokuPayEvent(eventId, notification, log);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.rokuPayEvent
      .update({
        where: { id: eventId },
        data: {
          status: "failed",
          errorMessage: message.slice(0, 500),
          processedAt: new Date(),
        },
      })
      .catch(() => {
        // Preserve the original failure path; the API response should signal retry.
      });
    throw err;
  }
}

async function processRokuPayEvent(
  eventId: string,
  notification: RokuPayNotification,
  log: FastifyBaseLogger,
): Promise<void> {
  const productCode = notification.productCode ?? "";
  const billingInterval = billingIntervalForRokuProduct(productCode);

  if (productCode && billingInterval === null) {
    await markRokuPayEvent(eventId, "ignored", "unknown_product_code");
    log.warn(
      { transactionId: notification.transactionId, productCode },
      "roku.pay_push.unknown_product",
    );
    return;
  }

  const subscription = await findSubscriptionForRokuPayNotification(notification);
  if (!subscription) {
    await markRokuPayEvent(eventId, "ignored", "no_matching_subscription");
    log.warn(
      {
        transactionId: notification.transactionId,
        originalTransactionId: notification.originalTransactionId,
        customerId: notification.customerId,
      },
      "roku.pay_push.no_matching_subscription",
    );
    return;
  }

  const expiresAt = parseRokuDate(notification.expirationDate);
  const action = deriveRokuPayPushAction(notification);
  const metadata: Prisma.SubscriptionUpdateInput = {
    rokuCustomerId: notification.customerId ?? subscription.rokuCustomerId ?? undefined,
    rokuOriginalTransactionId:
      notification.originalTransactionId ?? subscription.rokuOriginalTransactionId ?? undefined,
    rokuProductCode: productCode || subscription.rokuProductCode || undefined,
    rokuLastEventType: notification.transactionType ?? "Unknown",
  };
  if (action === "activate" && notification.transactionId) {
    metadata.rokuTransactionId = notification.transactionId;
  }

  if (action === "activate" || action === "keep_active") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        ...metadata,
        plan: "PRO",
        status: "ACTIVE",
        billingInterval: billingInterval ?? subscription.billingInterval ?? undefined,
        currentPeriodEnd: expiresAt ?? undefined,
      },
    });
  } else if (action === "cancel") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        ...metadata,
        plan: "FREE",
        status: "CANCELED",
        billingInterval: null,
        currentPeriodEnd: expiresAt ?? null,
      },
    });
  } else if (action === "cancel_at_period_end") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        ...metadata,
        plan: "PRO",
        status: "ACTIVE",
        currentPeriodEnd: expiresAt ?? subscription.currentPeriodEnd ?? undefined,
      },
    });
  } else {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: metadata,
    });
  }

  await markRokuPayEvent(eventId, "processed", null);
  log.info(
    {
      transactionId: notification.transactionId,
      transactionType: notification.transactionType,
      action,
      userId: subscription.userId,
    },
    "roku.pay_push.processed",
  );
}

async function markRokuPayEvent(
  eventId: string,
  status: "processed" | "ignored",
  reason: string | null,
): Promise<void> {
  await prisma.rokuPayEvent.update({
    where: { id: eventId },
    data: {
      status,
      errorMessage: reason,
      processedAt: new Date(),
    },
  });
}

async function findSubscriptionForRokuPayNotification(notification: RokuPayNotification) {
  const clauses: Prisma.SubscriptionWhereInput[] = [];
  if (notification.transactionId) {
    clauses.push({ rokuTransactionId: notification.transactionId });
    clauses.push({ rokuOriginalTransactionId: notification.transactionId });
  }
  if (notification.originalTransactionId) {
    clauses.push({ rokuTransactionId: notification.originalTransactionId });
    clauses.push({ rokuOriginalTransactionId: notification.originalTransactionId });
  }
  if (notification.customerId) {
    clauses.push({ rokuCustomerId: notification.customerId });
  }

  if (clauses.length === 0) return null;

  return prisma.subscription.findFirst({
    where: { OR: clauses },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
      billingInterval: true,
      currentPeriodEnd: true,
      rokuCustomerId: true,
      rokuTransactionId: true,
      rokuOriginalTransactionId: true,
      rokuProductCode: true,
    },
  });
}

function billingIntervalForRokuProduct(productCode: string): "MONTHLY" | "YEARLY" | null {
  if (productCode === env.ROKU_PRODUCT_ID_PRO_MONTHLY) return "MONTHLY";
  if (productCode === env.ROKU_PRODUCT_ID_PRO_YEARLY) return "YEARLY";
  return null;
}

export function deriveRokuPayPushAction(notification: {
  transactionType?: string;
  expirationDate?: string;
}): RokuPayPushAction {
  const type = notification.transactionType ?? "";
  const expiration = parseRokuDate(notification.expirationDate);

  if (
    [
      "Sale",
      "Resubscribe",
      "GraceRecovered",
      "OnHoldRecovered",
      "UpgradeSale",
      "DowngradeSale",
      "CancellationOfferInitiated",
      "CancellationOfferEnded",
    ].includes(type)
  ) {
    return "activate";
  }

  if (type === "GraceInitiated") {
    return "keep_active";
  }

  if (["OnHoldInitiated", "Refund"].includes(type)) {
    return "cancel";
  }

  if (type === "Cancellation") {
    if (expiration && expiration.getTime() > Date.now()) return "cancel_at_period_end";
    return "cancel";
  }

  // Upgrade/Downgrade cancellation events refer to the previous product.
  // The paired Sale event owns the account-level Pro entitlement.
  return "metadata_only";
}

function parseRokuDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

// ── Upstream fetch with size + timeout enforcement ────────────────

export async function fetchWithLimits(url: string): Promise<Buffer> {
  const controller = new AbortController();

  // Overall timeout
  const timeout = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);

  try {
    let currentUrl = url;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "StreamShogun-EPGProxy/1.0",
          Accept: "application/xml, text/xml, application/gzip, */*",
          "Accept-Encoding": "gzip, deflate",
        },
        redirect: "manual",
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        }

        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Upstream redirect ${response.status} missing Location header`);
        }

        const redirectedUrl = new URL(location, currentUrl).toString();
        const validation = await validateEpgUrl(redirectedUrl);
        if (!validation.ok) {
          throw new Error(`Unsafe redirect target: ${validation.reason}`);
        }

        currentUrl = validation.url.href;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
      }

      // Read body with size enforcement
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      if (!response.body) {
        throw new Error("Upstream returned empty body");
      }

      const reader = response.body.getReader();
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (done) break;
        const value = result.value;
        totalSize += value.length;
        if (totalSize > MAX_DOWNLOAD_BYTES) {
          reader.cancel();
          throw new Error(`Download exceeds ${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB size limit`);
        }
        chunks.push(value);
      }

      return Buffer.concat(chunks);
    }

    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
  } finally {
    clearTimeout(timeout);
  }
}

async function validateRokuPayTransaction(purchaseId: string): Promise<Record<string, unknown>> {
  const url = `https://apipub.roku.com/listen/transaction-service.svc/validate-transaction/${encodeURIComponent(env.ROKU_PAY_API_KEY!)}/${encodeURIComponent(purchaseId)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "StreamShogun-RokuPay/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Roku Pay returned ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Roku Pay returned an invalid validation payload.");
  }
  return payload as Record<string, unknown>;
}

function isRokuEntitled(payload: Record<string, unknown>): boolean {
  const value = readRokuField(payload, ["isEntitled", "is_entitled"]);
  return value === true || String(value).toLowerCase() === "true";
}

function extractRokuExpiration(payload: Record<string, unknown>): Date | null {
  const value = readRokuField(payload, ["expirationDate", "expiration_date"]);
  if (typeof value !== "string" || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readRokuString(payload: Record<string, unknown>, names: string[]): string | null {
  const value = readRokuField(payload, names);
  if (typeof value !== "string" || value === "") return null;
  return value;
}

function readRokuField(payload: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (payload[name] !== undefined) return payload[name];
  }

  const result = payload.result;
  if (typeof result === "object" && result !== null) {
    const typed = result as Record<string, unknown>;
    for (const name of names) {
      if (typed[name] !== undefined) return typed[name];
    }
  }

  return undefined;
}
