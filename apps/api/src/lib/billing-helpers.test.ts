import { describe, it, expect } from "vitest";
import {
  mapStripeStatus,
  derivePlan,
  getInvoiceSubscriptionId,
  extractPeriodEnd,
  resolveStripeId,
  extractBillingInterval,
  isIncompleteStatus,
} from "./billing-helpers.js";

// ── mapStripeStatus ──────────────────────────────────────────────

describe("mapStripeStatus", () => {
  it.each([
    ["active", "ACTIVE"],
    ["trialing", "TRIALING"],
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

  it("returns PRO when status is TRIALING", () => {
    expect(derivePlan("TRIALING")).toBe("PRO");
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

// ── isIncompleteStatus ───────────────────────────────────────────

describe("isIncompleteStatus", () => {
  it.each(["incomplete", "incomplete_expired", "paused"])(
    "returns true for '%s'",
    (status) => {
      expect(isIncompleteStatus(status)).toBe(true);
    },
  );

  it.each(["active", "trialing", "past_due", "unpaid", "canceled", "unknown"])(
    "returns false for '%s'",
    (status) => {
      expect(isIncompleteStatus(status)).toBe(false);
    },
  );
});

// ── mapStripeStatus — additional edge cases ──────────────────────

describe("mapStripeStatus — edge cases", () => {
  it("maps 'incomplete' → CANCELED", () => {
    expect(mapStripeStatus("incomplete")).toBe("CANCELED");
  });

  it("maps '' (empty string) → CANCELED", () => {
    expect(mapStripeStatus("")).toBe("CANCELED");
  });
});

// ── derivePlan — full matrix ─────────────────────────────────────

describe("derivePlan — combined with mapStripeStatus", () => {
  it.each([
    ["active", "PRO"],
    ["trialing", "PRO"],
    ["past_due", "FREE"],
    ["unpaid", "FREE"],
    ["canceled", "FREE"],
    ["incomplete", "FREE"],
    ["incomplete_expired", "FREE"],
    ["paused", "FREE"],
  ] as const)("stripe '%s' → plan %s", (stripeStatus, expectedPlan) => {
    expect(derivePlan(mapStripeStatus(stripeStatus))).toBe(expectedPlan);
  });
});

// ── Edge-case: canceled_at_period_end ────────────────────────────
// Stripe sends subscription.updated with status="active" and
// cancel_at_period_end=true. Our helpers still see status=active →
// ACTIVE/PRO (user retains access until period end). The
// cancel_at_period_end flag is informational; the actual cancel
// arrives later as customer.subscription.deleted.

describe("canceled_at_period_end scenario", () => {
  it("status=active with cancel_at_period_end=true still maps to ACTIVE/PRO", () => {
    const status = "active"; // Stripe still reports active
    expect(mapStripeStatus(status)).toBe("ACTIVE");
    expect(derivePlan(mapStripeStatus(status))).toBe("PRO");
  });

  it("isIncompleteStatus returns false for active (even pending cancellation)", () => {
    expect(isIncompleteStatus("active")).toBe(false);
  });

  it("extractPeriodEnd reads the period end date correctly for a future-cancel sub", () => {
    const futureEpoch = 1767225600; // 2025-12-31T00:00:00Z
    const sub = {
      items: { data: [{ current_period_end: futureEpoch }] },
    } as any;
    const result = extractPeriodEnd(sub);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(futureEpoch * 1000);
  });
});

// ── Edge-case: trialing subscription ─────────────────────────────
// A trialing subscription must grant PRO access immediately.

describe("trialing subscription scenario", () => {
  it("trialing → TRIALING → PRO", () => {
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(derivePlan("TRIALING")).toBe("PRO");
  });

  it("trialing is NOT an incomplete status (should not be skipped)", () => {
    expect(isIncompleteStatus("trialing")).toBe(false);
  });

  it("extractBillingInterval works on trialing sub with monthly price", () => {
    const sub = {
      items: { data: [{ price: { recurring: { interval: "month" } }, current_period_end: 1735689600 }] },
    } as any;
    expect(extractBillingInterval(sub)).toBe("MONTHLY");
    expect(extractPeriodEnd(sub)).toBeInstanceOf(Date);
  });
});

// ── Edge-case: incomplete subscription ───────────────────────────
// An incomplete subscription must be ignored by the upsert handler.

describe("incomplete subscription scenario", () => {
  it("incomplete IS an incomplete status (handler must skip)", () => {
    expect(isIncompleteStatus("incomplete")).toBe(true);
  });

  it("incomplete maps to CANCELED/FREE if it somehow slips through", () => {
    expect(mapStripeStatus("incomplete")).toBe("CANCELED");
    expect(derivePlan(mapStripeStatus("incomplete"))).toBe("FREE");
  });

  it("incomplete_expired is also skipped", () => {
    expect(isIncompleteStatus("incomplete_expired")).toBe(true);
    expect(mapStripeStatus("incomplete_expired")).toBe("CANCELED");
  });

  it("paused is also skipped", () => {
    expect(isIncompleteStatus("paused")).toBe(true);
    expect(mapStripeStatus("paused")).toBe("CANCELED");
  });
});

// ── Edge-case: unpaid subscription ───────────────────────────────
// An unpaid subscription should downgrade to PAST_DUE/FREE.

describe("unpaid subscription scenario", () => {
  it("unpaid → PAST_DUE → FREE", () => {
    expect(mapStripeStatus("unpaid")).toBe("PAST_DUE");
    expect(derivePlan("PAST_DUE")).toBe("FREE");
  });

  it("unpaid is NOT an incomplete status (it should be processed, not skipped)", () => {
    expect(isIncompleteStatus("unpaid")).toBe(false);
  });
});

// ── Edge-case: duplicate event delivery ──────────────────────────
// Stripe may deliver the same event multiple times. Our webhook
// handler relies on the WebhookEvent unique constraint on
// stripeEventId — the second delivery hits isPrismaUniqueViolation
// and returns 200. This test validates helper purity: calling the
// same helpers twice with the same input yields identical results,
// demonstrating that the mapping layer is inherently idempotent.

describe("duplicate event delivery — helper idempotency", () => {
  const stripeStatus = "active";
  const sub = {
    customer: "cus_123",
    items: {
      data: [
        {
          price: { recurring: { interval: "year" } },
          current_period_end: 1767225600,
        },
      ],
    },
  } as any;

  it("repeated calls to mapStripeStatus produce identical results", () => {
    const r1 = mapStripeStatus(stripeStatus);
    const r2 = mapStripeStatus(stripeStatus);
    expect(r1).toBe(r2);
    expect(r1).toBe("ACTIVE");
  });

  it("repeated calls to derivePlan produce identical results", () => {
    const r1 = derivePlan(mapStripeStatus(stripeStatus));
    const r2 = derivePlan(mapStripeStatus(stripeStatus));
    expect(r1).toBe(r2);
    expect(r1).toBe("PRO");
  });

  it("repeated calls to extractPeriodEnd produce identical results", () => {
    const r1 = extractPeriodEnd(sub);
    const r2 = extractPeriodEnd(sub);
    expect(r1!.getTime()).toBe(r2!.getTime());
  });

  it("repeated calls to extractBillingInterval produce identical results", () => {
    const r1 = extractBillingInterval(sub);
    const r2 = extractBillingInterval(sub);
    expect(r1).toBe(r2);
    expect(r1).toBe("YEARLY");
  });

  it("repeated calls to resolveStripeId produce identical results", () => {
    const r1 = resolveStripeId(sub.customer);
    const r2 = resolveStripeId(sub.customer);
    expect(r1).toBe(r2);
    expect(r1).toBe("cus_123");
  });
});
