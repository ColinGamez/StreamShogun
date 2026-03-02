import Stripe from "stripe";
import { env } from "../config/env.js";

/**
 * Lazily-initialized Stripe client.
 * Throws at call-time if STRIPE_SECRET_KEY is not configured.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}
