// ── Session cleanup — prunes expired and revoked sessions ─────────────
//
// Runs on a fixed interval after server start.  Safe to call from
// a single node; for multi-replica deploys, replace with a DB-level
// cron job or external scheduler.

import { prisma } from "./prisma.js";
import type { FastifyBaseLogger } from "fastify";

/** How often to run (default: every 6 hours) */
const INTERVAL_MS = 6 * 60 * 60 * 1000;

/** How long to keep revoked sessions for audit (default: 30 days) */
const REVOKED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

async function cleanup(log: FastifyBaseLogger): Promise<void> {
  const now = new Date();

  try {
    // 1. Delete sessions that expired (refresh token is stale)
    const { count: expired } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    // 2. Delete sessions revoked > 30 days ago
    const revokedBefore = new Date(now.getTime() - REVOKED_RETENTION_MS);
    const { count: revoked } = await prisma.session.deleteMany({
      where: {
        revokedAt: { not: null, lt: revokedBefore },
      },
    });

    if (expired > 0 || revoked > 0) {
      log.info(
        { expired, revoked },
        "session-cleanup: pruned stale sessions",
      );
    }
  } catch (err) {
    log.error({ err }, "session-cleanup: failed");
  }
}

/** Start the periodic cleanup.  Call once after the server is ready. */
export function startSessionCleanup(log: FastifyBaseLogger): void {
  // Run once immediately, then on interval
  void cleanup(log);
  timer = setInterval(() => void cleanup(log), INTERVAL_MS);
  log.info(
    { intervalMs: INTERVAL_MS },
    "session-cleanup: scheduled",
  );
}

/** Stop the periodic cleanup (call during graceful shutdown). */
export function stopSessionCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
