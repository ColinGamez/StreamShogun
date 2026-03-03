import Stripe from "stripe";
import { env } from "../config/env.js";

// ── Safety: prevent Stripe live keys outside production ───────────
function assertStripeKeyMatchesEnv(key: string): void {
  const isLiveKey = key.startsWith("sk_live_");
  const isProduction = env.NODE_ENV === "production";

  if (isLiveKey && !isProduction) {
    throw new Error(
      `FATAL: Stripe live key detected in NODE_ENV="${env.NODE_ENV}". ` +
        "Use sk_test_* keys outside production. Aborting.",
    );
  }

  if (!isLiveKey && isProduction) {
    console.warn(
      "⚠️  Stripe TEST key in production — billing will use Stripe test mode.",
    );
  }
}

/**
 * Lazily-initialized Stripe client.
 * Throws at call-time if STRIPE_SECRET_KEY is not configured.
 * Runtime assertion prevents live keys from running in staging/dev.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    assertStripeKeyMatchesEnv(env.STRIPE_SECRET_KEY);
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}
