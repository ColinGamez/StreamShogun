import "dotenv/config";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { isEmailConfigured } from "./lib/password-reset.js";
import { initSentry, flushSentry, isSentryEnabled } from "./lib/sentry.js";
import { startSessionCleanup, stopSessionCleanup } from "./lib/session-cleanup.js";

async function main() {
  // Initialise Sentry before anything else (no-ops if SENTRY_DSN not set)
  initSentry();

  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down …`);
      stopSessionCleanup();
      await app.close();
      await flushSentry();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    startSessionCleanup(app.log);
    const emailConfigured = isEmailConfigured();
    app.log.info(
      { port: env.PORT, host: env.HOST, sentry: isSentryEnabled(), emailConfigured },
      `🚀 StreamShōgun API listening on http://${env.HOST}:${env.PORT}`,
    );

    if (!emailConfigured) {
      app.log.warn(
        env.NODE_ENV === "production"
          ? "SMTP_URL is not configured; password reset emails will not be delivered in production."
          : "SMTP_URL / RESEND_API_KEY is not configured; password reset emails will fall back to the local debug preview link.",
      );
    }
  } catch (err) {
    app.log.error(err);
    await flushSentry();
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
