import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { MASTER_EMAIL: "master@example.com" },
}));

import { effectiveSubscription, isMasterEmail } from "./master-account.js";

describe("master account entitlement", () => {
  it("matches the configured email case-insensitively", () => {
    expect(isMasterEmail(" MASTER@example.com ")).toBe(true);
    expect(isMasterEmail("viewer@example.com")).toBe(false);
  });

  it("returns a permanent active Pro entitlement even when the database row is Free", () => {
    expect(
      effectiveSubscription("master@example.com", {
        plan: "FREE",
        status: "CANCELED",
        billingInterval: null,
        currentPeriodEnd: null,
      }),
    ).toEqual({
      plan: "PRO",
      status: "ACTIVE",
      billingInterval: null,
      currentPeriodEnd: null,
    });
  });

  it("preserves the database subscription for normal users", () => {
    expect(
      effectiveSubscription("viewer@example.com", {
        plan: "PRO",
        status: "TRIALING",
        billingInterval: "YEARLY",
        currentPeriodEnd: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).toEqual({
      plan: "PRO",
      status: "TRIALING",
      billingInterval: "YEARLY",
      currentPeriodEnd: "2030-01-01T00:00:00.000Z",
    });
  });
});
