import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
    // Billing/auth routes spin up Fastify + JWT + mocked Prisma/Stripe;
    // under parallel workers cold-start can exceed even generous per-test
    // timeouts (observed 15s+ on loaded Windows runners while the same test
    // takes ~1.5s isolated). This is a failure threshold, not a target.
    testTimeout: 30000,
  },
});
