import { describe, it, expect } from "vitest";
import {
  mapStripeStatus,
  derivePlan,
  getInvoiceSubscriptionId,
  extractPeriodEnd,
  resolveStripeId,
  extractBillingInterval,
} from "./billing-helpers.js";

// ── mapStripeStatus ──────────────────────────────────────────────

describe("mapStripeStatus", () => {
  it.each([
    ["active", "ACTIVE"],
    ["trialing", "ACTIVE"],
  ] as const)("maps '%s' → %s", (input, expected) => {
    expect(mapStripeStatus(input)).toBe(expected);
  });

  it.each([
    ["past_due", "PAST_DUE"],
    ["unpaid", "PAST_DUE"],
  ] as const)("maps '%s' → %s", (input, expected) => {
    expect(mapStripeStatus(input)).toBe(expected);
  });

  it.each([
    ["canceled", "CANCELED"],
    ["incomplete_expired", "CANCELED"],
    ["paused", "CANCELED"],
    ["unknown_status", "CANCELED"],
  ] as const)("maps '%s' → CANCELED (default)", (input, expected) => {
    expect(mapStripeStatus(input)).toBe(expected);
  });
});

// ── derivePlan ───────────────────────────────────────────────────

describe("derivePlan", () => {
  it("returns PRO when status is ACTIVE", () => {
    expect(derivePlan("ACTIVE")).toBe("PRO");
  });

  it("returns FREE when status is PAST_DUE", () => {
    expect(derivePlan("PAST_DUE")).toBe("FREE");
  });

  it("returns FREE when status is CANCELED", () => {
    expect(derivePlan("CANCELED")).toBe("FREE");
  });
});

// ── getInvoiceSubscriptionId ─────────────────────────────────────

describe("getInvoiceSubscriptionId", () => {
  it("returns subscription ID from string ref", () => {
    const invoice = {
      parent: {
        subscription_details: {
          subscription: "sub_abc123",
        },
      },
    } as any;
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_abc123");
  });

  it("returns subscription ID from expanded object", () => {
    const invoice = {
      parent: {
        subscription_details: {
          subscription: { id: "sub_xyz789" },
        },
      },
    } as any;
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_xyz789");
  });

  it("returns null when parent is missing", () => {
    const invoice = {} as any;
    expect(getInvoiceSubscriptionId(invoice)).toBeNull();
  });

  it("returns null when subscription_details is missing", () => {
    const invoice = { parent: {} } as any;
    expect(getInvoiceSubscriptionId(invoice)).toBeNull();
  });

  it("returns null when subscription is null", () => {
    const invoice = {
      parent: { subscription_details: { subscription: null } },
    } as any;
    expect(getInvoiceSubscriptionId(invoice)).toBeNull();
  });
});

// ── extractPeriodEnd ─────────────────────────────────────────────

describe("extractPeriodEnd", () => {
  it("converts Unix epoch to Date", () => {
    const epoch = 1735689600; // 2025-01-01T00:00:00Z
    const sub = {
      items: { data: [{ current_period_end: epoch }] },
    } as any;
    const result = extractPeriodEnd(sub);
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("returns null when items is missing", () => {
    const sub = {} as any;
    expect(extractPeriodEnd(sub)).toBeNull();
  });

  it("returns null when items.data is empty", () => {
    const sub = { items: { data: [] } } as any;
    expect(extractPeriodEnd(sub)).toBeNull();
  });

  it("returns null when current_period_end is undefined", () => {
    const sub = { items: { data: [{}] } } as any;
    expect(extractPeriodEnd(sub)).toBeNull();
  });
});

// ── resolveStripeId ──────────────────────────────────────────────

describe("resolveStripeId", () => {
  it("returns string ID as-is", () => {
    expect(resolveStripeId("cus_abc123")).toBe("cus_abc123");
  });

  it("extracts ID from expanded object", () => {
    expect(resolveStripeId({ id: "sub_xyz789" })).toBe("sub_xyz789");
  });

  it("returns null for null input", () => {
    expect(resolveStripeId(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveStripeId(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    // empty string is falsy, should return null
    expect(resolveStripeId("")).toBeNull();
  });
});

// ── extractBillingInterval ───────────────────────────────────────

describe("extractBillingInterval", () => {
  it("returns MONTHLY for 'month' interval", () => {
    const sub = {
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    } as any;
    expect(extractBillingInterval(sub)).toBe("MONTHLY");
  });

  it("returns YEARLY for 'year' interval", () => {
    const sub = {
      items: { data: [{ price: { recurring: { interval: "year" } } }] },
    } as any;
    expect(extractBillingInterval(sub)).toBe("YEARLY");
  });

  it("returns null for 'week' interval", () => {
    const sub = {
      items: { data: [{ price: { recurring: { interval: "week" } } }] },
    } as any;
    expect(extractBillingInterval(sub)).toBeNull();
  });

  it("returns null when items is missing", () => {
    const sub = {} as any;
    expect(extractBillingInterval(sub)).toBeNull();
  });

  it("returns null when items.data is empty", () => {
    const sub = { items: { data: [] } } as any;
    expect(extractBillingInterval(sub)).toBeNull();
  });

  it("returns null when price is missing", () => {
    const sub = { items: { data: [{}] } } as any;
    expect(extractBillingInterval(sub)).toBeNull();
  });

  it("returns null when recurring is missing", () => {
    const sub = { items: { data: [{ price: {} }] } } as any;
    expect(extractBillingInterval(sub)).toBeNull();
  });
});
