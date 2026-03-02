// ── Pino logger configuration with redaction ──────────────────────
import type { FastifyServerOptions } from "fastify";

/**
 * Paths whose values are replaced with "[REDACTED]" in log output.
 * Covers request bodies, headers, and nested error context.
 */
const REDACT_PATHS = [
  // Request body fields — auth
  'req.body.password',
  'req.body.newPassword',
  'req.body.confirmPassword',
  'req.body.currentPassword',
  'req.body.refreshToken',
  'req.body.token',

  // Headers that carry secrets
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-key"]',
  'req.headers["stripe-signature"]',

  // Anything that leaks into error context
  'err.config.headers.authorization',
  'err.config.headers.cookie',
];

/**
 * Resolve the log level:
 *  1. LOG_LEVEL env var (explicit override)
 *  2. "info" in production, "debug" otherwise
 */
function resolveLogLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Build the Fastify logger options object.
 * - Production: JSON lines (machine-readable) for Railway log drain
 * - Development: pino-pretty with colours
 */
export function buildLoggerOptions(): FastifyServerOptions["logger"] {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    level: resolveLogLevel(),

    // Redact sensitive fields in every log line
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },

    // Serializers — keep access logs lean and sanitised
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
          // Omit full headers in prod — keep content-type only
          ...(isProduction
            ? { contentType: request.headers?.["content-type"] }
            : { headers: request.headers }),
        };
      },
      res(reply) {
        return {
          statusCode: reply.statusCode,
        };
      },
    },

    // Pretty-print in dev only (pino-pretty is a devDependency)
    transport: !isProduction
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } }
      : undefined,
  };
}
