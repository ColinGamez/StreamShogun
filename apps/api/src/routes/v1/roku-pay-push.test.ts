import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const prismaMock = {
  rokuPayEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  subscription: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../config/env.js", () => ({
  env: {
    ROKU_PAY_API_KEY: "rk_test_key",
    ROKU_PRODUCT_ID_PRO_MONTHLY: "prod_monthly",
    ROKU_PRODUCT_ID_PRO_YEARLY: "prod_yearly",
  },
}));

async function buildTestApp() {
  const { rokuRoutes } = await import("./roku.js");
  const app = Fastify();
  await app.register(rokuRoutes, { prefix: "/v1/roku" });
  return app;
}

function pushBody(overrides: Record<string, unknown> = {}) {
  return {
    responseKey: "rk_response_1",
    transactionId: "txn_1",
    customerId: "roku_cus_1",
    productCode: "prod_monthly",
    transactionType: "Sale",
    expirationDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
    ...overrides,
  };
}

function mockValidator(result: { ok: boolean; entitled?: boolean } | { throw: string }) {
  const fetchMock = vi.fn(async () => {
    if ("throw" in result) throw new Error(result.throw);
    return {
      ok: result.ok,
      status: result.ok ? 200 : 500,
      statusText: result.ok ? "OK" : "Error",
      json: async () => ({ isEntitled: result.entitled ?? false }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("roku pay-push verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.rokuPayEvent.findUnique.mockResolvedValue(null);
    prismaMock.rokuPayEvent.create.mockResolvedValue({ id: "evt_1" });
    prismaMock.rokuPayEvent.update.mockResolvedValue({ id: "evt_1" });
    prismaMock.subscription.findFirst.mockResolvedValue({
      id: "sub_1",
      userId: "user_1",
      billingInterval: "MONTHLY",
      currentPeriodEnd: null,
    });
    prismaMock.subscription.update.mockResolvedValue({ id: "sub_1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("grants PRO when Roku confirms the transaction", async () => {
    const fetchMock = mockValidator({ ok: true, entitled: true });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/roku/pay-push",
      payload: pushBody(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("rk_response_1");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_1" },
        data: expect.objectContaining({ plan: "PRO", status: "ACTIVE" }),
      }),
    );
    await app.close();
  });

  it("ignores the push without mutating when Roku denies entitlement", async () => {
    mockValidator({ ok: true, entitled: false });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/roku/pay-push",
      payload: pushBody(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("rk_response_1");
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.rokuPayEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt_1" },
        data: expect.objectContaining({ status: "ignored", errorMessage: "roku_not_entitled" }),
      }),
    );
    await app.close();
  });

  it("returns 500 for retry when the Roku validator is unreachable", async () => {
    mockValidator({ throw: "boom" });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/roku/pay-push",
      payload: pushBody(),
    });

    expect(response.statusCode).toBe(500);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("verifies cancel actions too before revoking", async () => {
    const fetchMock = mockValidator({ ok: true, entitled: true });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/roku/pay-push",
      payload: pushBody({ transactionType: "Refund" }),
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ plan: "FREE", status: "CANCELED" }),
      }),
    );
    await app.close();
  });

  it("skips verification for metadata-only events", async () => {
    const fetchMock = mockValidator({ ok: true, entitled: true });
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/roku/pay-push",
      payload: pushBody({ transactionType: "UpgradeCancel" }),
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
