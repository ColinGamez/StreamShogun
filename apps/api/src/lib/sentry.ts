// ── Optional Sentry integration ────────────────────────────────────
// Only initialises when SENTRY_DSN env var is set.
// Safe to import unconditionally — all exports are no-ops without a DSN.

import * as Sentry from "@sentry/node";
import type { FastifyError, FastifyRequest, FastifyReply } from "fastify";

let _initialised = false;

/**
 * Initialise Sentry if SENTRY_DSN is provided.
 * Call once at startup, before building the Fastify app.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version ?? "0.0.0",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    // Do not send PII — keep it compliant
    sendDefaultPii: false,
  });

  _initialised = true;
}

/** Whether Sentry has been successfully initialised. */
export function isSentryEnabled(): boolean {
  return _initialised;
}

/**
 * Capture an exception in Sentry with Fastify request context.
 * No-ops silently if Sentry is not initialised.
 */
export function captureError(
  err: FastifyError | Error,
  request?: FastifyRequest,
): void {
  if (!_initialised) return;

  Sentry.withScope((scope) => {
    if (request) {
      scope.setTag("method", request.method);
      scope.setTag("url", request.url);
      scope.setUser({ id: (request as unknown as { user?: { sub?: string } }).user?.sub });
    }
    Sentry.captureException(err);
  });
}

/**
 * Fastify error handler that reports to Sentry then delegates.
 * Wrap your existing error handler with this.
 */
export function sentryErrorHandler(
  originalHandler: (err: FastifyError, request: FastifyRequest, reply: FastifyReply) => void,
) {
  return (err: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
    captureError(err, request);
    originalHandler(err, request, reply);
  };
}

/**
 * Flush pending Sentry events (call before process exit).
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!_initialised) return;
  await Sentry.flush(timeoutMs);
}
