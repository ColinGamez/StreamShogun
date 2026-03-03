import "dotenv/config";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
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
    app.log.info(
      { port: env.PORT, host: env.HOST, sentry: isSentryEnabled() },
      `🚀 StreamShōgun API listening on http://${env.HOST}:${env.PORT}`,
    );
  } catch (err) {
    app.log.error(err);
    await flushSentry();
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
