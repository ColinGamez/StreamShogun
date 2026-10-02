import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
    // Billing/auth routes spin up Fastify + JWT + mocked Prisma/Stripe;
    // under parallel workers cold-start can exceed the 5s default (seen ~12s on Windows).
    testTimeout: 15000,
  },
});
