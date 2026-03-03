import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),

  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),

  // Optional — Sentry error tracking (set to enable)
  SENTRY_DSN: z.string().url().optional(),

  // Optional — Admin API key (set to enable admin endpoints)
  ADMIN_KEY: z.string().min(16).optional(),

  // Public URL (used for Stripe return URLs, etc.)
  APP_PUBLIC_URL: z.string().url().optional(),

  // Stripe billing (optional — enables /v1/billing endpoints)
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_ID_PRO_MONTHLY: z.string().startsWith("price_").optional(),
  STRIPE_PRICE_ID_PRO_YEARLY: z.string().startsWith("price_").optional(),

  // Portal return URL (defaults to APP_PUBLIC_URL)
  STRIPE_PORTAL_RETURN_URL: z.string().url().optional(),

  // Kill-switch: set to "true" to disable billing routes at runtime
  BILLING_DISABLED: z.string().optional(),

  // Founding member cutoff date (ISO 8601). Users created before this
  // date get a founding-member badge. Defaults to 2026-06-01.
  FOUNDING_MEMBER_CUTOFF: z.string().datetime().optional(),
}).superRefine((data, ctx) => {
  // When billing is configured, enforce that essential companion vars are present
  if (data.STRIPE_SECRET_KEY && data.BILLING_DISABLED !== "true") {
    if (!data.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_WEBHOOK_SECRET"],
        message: "Required when STRIPE_SECRET_KEY is set (billing enabled)",
      });
    }
    if (!data.STRIPE_PRICE_ID_PRO_MONTHLY && !data.STRIPE_PRICE_ID_PRO_YEARLY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_PRICE_ID_PRO_MONTHLY"],
        message: "At least one of STRIPE_PRICE_ID_PRO_MONTHLY or STRIPE_PRICE_ID_PRO_YEARLY is required when billing is enabled",
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
