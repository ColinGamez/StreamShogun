import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

const stripeMock = {
  customers: {
    list: vi.fn(),
  },
  subscriptions: {
    list: vi.fn(),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../lib/stripe.js", () => ({
  getStripe: () => stripeMock,
}));

vi.mock("../../config/env.js", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_billing_reconcile",
    STRIPE_WEBHOOK_SECRET: "whsec_billing_reconcile",
    BILLING_DISABLED: "false",
    CORS_ORIGIN: "https://streamshogun.com",
    APP_PUBLIC_URL: "https://streamshogun.com",
    STRIPE_PRICE_ID_PRO_MONTHLY: "price_monthly",
    STRIPE_PRICE_ID_PRO_YEARLY: "price_yearly",
  },
}));

const jwtSecretForTest = ["billing", "routes", "jwt", "test", "secret"].join("-");

async function buildTestApp() {
  const { billingRoutes } = await import("./billing.js");
  const app = Fastify();
  await app.register(jwt, { secret: jwtSecretForTest });
  await app.register(billingRoutes, { prefix: "/v1/billing" });
  return app;
}

function authHeader(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const token = app.jwt.sign({ sub: "user_123", email: "colin.kenny777@gmail.com" });
  return { authorization: `Bearer ${token}` };
}

describe("billing reconcile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_123",
      email: "colin.kenny777@gmail.com",
    });
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.subscription.upsert.mockResolvedValue({ id: "subscription_123" });
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit_123" });
  });

  it("returns matched=false when Stripe has no active subscription for the email", async () => {
    stripeMock.customers.list.mockResolvedValue({ data: [{ id: "cus_123" }] });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: "sub_canceled",
          customer: "cus_123",
          status: "canceled",
          created: 10,
          items: { data: [] },
        },
      ],
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/reconcile",
      headers: authHeader(app),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      matched: false,
      message: "No active Stripe subscription found for this account email",
    });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();

    await app.close();
  });

  it("attaches the newest active Stripe subscription to the authenticated user", async () => {
    stripeMock.customers.list.mockResolvedValue({ data: [{ id: "cus_123" }] });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        {
          id: "sub_old",
          customer: "cus_123",
          status: "active",
          created: 10,
          items: {
            data: [
              {
                current_period_end: 1_800_000_000,
                price: { recurring: { interval: "month" } },
              },
            ],
          },
        },
        {
          id: "sub_new",
          customer: "cus_123",
          status: "active",
          created: 20,
          items: {
            data: [
              {
                current_period_end: 1_900_000_000,
                price: { recurring: { interval: "year" } },
              },
            ],
          },
        },
      ],
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/reconcile",
      headers: authHeader(app),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      matched: true,
      subscription: {
        plan: "PRO",
        status: "ACTIVE",
        billingInterval: "YEARLY",
        currentPeriodEnd: new Date(1_900_000_000 * 1000).toISOString(),
      },
    });
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_123" },
        update: expect.objectContaining({
          plan: "PRO",
          status: "ACTIVE",
          billingInterval: "YEARLY",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_new",
          currentPeriodEnd: new Date(1_900_000_000 * 1000),
        }),
      }),
    );

    await app.close();
  });
});
