import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  webhookEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

const stripeMock = {
  customers: {
    list: vi.fn(),
    create: vi.fn(),
  },
  subscriptions: {
    list: vi.fn(),
    retrieve: vi.fn(),
  },
  checkout: { sessions: { create: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
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
  const token = app.jwt.sign({ sub: "user_123", email: "master@example.com" });
  return { authorization: `Bearer ${token}` };
}

describe("billing reconcile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user_123",
      email: "master@example.com",
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

describe("billing checkout safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ id: "user_123" }]);
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "subscription_123",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.example" });
    stripeMock.checkout.sessions.list.mockResolvedValue({ data: [] });
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])(
    "blocks duplicate checkout when Stripe has a %s subscription before local sync",
    async (status) => {
      stripeMock.subscriptions.list.mockResolvedValue({ data: [{ id: "sub_live", status }] });
      const app = await buildTestApp();
      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        headers: authHeader(app),
        payload: { interval: "monthly" },
      });
      expect(response.statusCode).toBe(409);
      expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it.each([
    { data: [] },
    { data: [{ status: "canceled" }] },
    { data: [{ status: "incomplete_expired" }] },
  ])("allows checkout when no ongoing subscriptions remain (%j)", async (subscriptions) => {
    stripeMock.subscriptions.list.mockResolvedValue(subscriptions);
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeader(app),
      payload: { interval: "monthly" },
    });
    expect(response.statusCode).toBe(200);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledOnce();
    await app.close();
  });

  it("fails the webhook for retry instead of granting Pro when Stripe retrieval fails", async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: { subscription: "sub_123", customer: "cus_123", metadata: { userId: "user_123" } },
      },
    });
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error("Stripe unavailable"));
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
    prismaMock.webhookEvent.create.mockResolvedValue({ id: "event_row" });
    prismaMock.webhookEvent.update.mockResolvedValue({});

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/webhook",
      headers: { "stripe-signature": "test_signature", "content-type": "application/json" },
      payload: "{}",
    });
    expect(response.statusCode).toBe(500);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
    await app.close();
  });

  it("reuses the same monthly checkout across separate API instances and simultaneous tabs", async () => {
    let queue = Promise.resolve();
    prismaMock.$transaction.mockImplementation(async (callback) => {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tx = {
        ...prismaMock,
        $queryRaw: vi.fn(async () => {
          await previous;
          return [{ id: "user_123" }];
        }),
      };
      try {
        return await callback(tx);
      } finally {
        release();
      }
    });
    const sessions: object[] = [];
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.list.mockImplementation(async () => ({ data: [...sessions] }));
    stripeMock.checkout.sessions.create.mockImplementation(async () => {
      const session = {
        id: "cs_shared",
        mode: "subscription",
        url: "https://checkout.example/shared",
        line_items: { data: [{ price: { id: "price_monthly" } }] },
      };
      sessions.push(session);
      return session;
    });
    const firstApp = await buildTestApp();
    const secondApp = await buildTestApp();
    const responses = await Promise.all(
      [firstApp, secondApp].map((app) =>
        app.inject({
          method: "POST",
          url: "/v1/billing/checkout",
          headers: authHeader(app),
          payload: { interval: "monthly" },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(responses.map((response) => response.json().url)).toEqual([
      "https://checkout.example/shared",
      "https://checkout.example/shared",
    ]);
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledOnce();
    await firstApp.close();
    await secondApp.close();
  });

  it("expires the previous monthly checkout before creating an annual checkout", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.list.mockImplementation(async ({ status }) => ({
      data:
        status === "open"
          ? [
              {
                id: "cs_monthly",
                mode: "subscription",
                url: "https://checkout.example/monthly",
                line_items: { data: [{ price: { id: "price_monthly" } }] },
              },
            ]
          : [{ id: "cs_monthly" }],
    }));
    stripeMock.checkout.sessions.expire.mockResolvedValue({ id: "cs_monthly", status: "expired" });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeader(app),
      payload: { interval: "yearly" },
    });
    expect(response.statusCode).toBe(200);
    expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith("cs_monthly");
    expect(stripeMock.checkout.sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(
      stripeMock.checkout.sessions.create.mock.invocationCallOrder[0],
    );
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_yearly", quantity: 1 }] }),
      { idempotencyKey: "checkout:cus_123:cs_monthly" },
    );
    await app.close();
  });

  it("does not create another checkout if the old session completes during a plan switch", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.list.mockResolvedValue({
      data: [{ id: "cs_completed_race", mode: "subscription" }],
    });
    stripeMock.checkout.sessions.expire.mockRejectedValue(
      new Error("Only open sessions can be expired"),
    );
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeader(app),
      payload: { interval: "yearly" },
    });
    expect(response.statusCode).toBe(500);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("uses the same idempotency key on a retry after an ambiguous Stripe failure", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.create.mockRejectedValueOnce(new Error("Connection reset"));
    const app = await buildTestApp();
    const request = {
      method: "POST" as const,
      url: "/v1/billing/checkout",
      headers: authHeader(app),
      payload: { interval: "monthly" },
    };
    expect((await app.inject(request)).statusCode).toBe(500);
    expect((await app.inject(request)).statusCode).toBe(200);
    expect(stripeMock.checkout.sessions.create.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: "checkout:cus_123:first" },
      { idempotencyKey: "checkout:cus_123:first" },
    ]);
    await app.close();
  });

  it("locks the user before creating a first Stripe customer with an idempotency key", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      user: { email: "test@example.com" },
    });
    stripeMock.customers.create.mockResolvedValue({ id: "cus_first" });
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    const app = await buildTestApp();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/billing/checkout",
          headers: authHeader(app),
          payload: { interval: "monthly" },
        })
      ).statusCode,
    ).toBe(200);
    expect(prismaMock.$queryRaw.mock.calls[0][0].join("?")).toBe(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
    );
    expect(prismaMock.$queryRaw.mock.calls[0][1]).toBe("user_123");
    expect(prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      stripeMock.customers.create.mock.invocationCallOrder[0],
    );
    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" }),
      { idempotencyKey: "customer:user_123" },
    );
    await app.close();
  });
});
