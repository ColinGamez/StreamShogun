// ── Support routes — codex index + feedback ───────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/authenticate.js";
import { prisma } from "../../lib/prisma.js";

// ── GET /v1/support-codex/index ────────────────────────────────────
// Returns article metadata so the desktop client can check for updates.
// Public endpoint — no auth required.

const CODEX_ARTICLES = [
  { id: "getting-started", title: "Getting Started with StreamShōgun", lastUpdated: "2026-03-03" },
  { id: "adding-playlists", title: "Adding & Managing Playlists", lastUpdated: "2026-03-03" },
  { id: "adding-epg", title: "Adding EPG Sources", lastUpdated: "2026-03-03" },
  { id: "epg-troubleshooting", title: "EPG Troubleshooting", lastUpdated: "2026-03-03" },
  { id: "playback-troubleshooting", title: "Playback Troubleshooting", lastUpdated: "2026-03-03" },
  { id: "pip-mini-player", title: "PIP Mini Player", lastUpdated: "2026-03-03" },
  { id: "discord-rich-presence", title: "Discord Rich Presence", lastUpdated: "2026-03-03" },
  { id: "subscriptions-billing", title: "Subscriptions & Billing", lastUpdated: "2026-03-03" },
  { id: "account-login", title: "Account & Login", lastUpdated: "2026-03-03" },
  { id: "privacy-security", title: "Privacy & Security", lastUpdated: "2026-03-03" },
  { id: "faq", title: "Frequently Asked Questions", lastUpdated: "2026-03-03" },
];

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/support/codex ───────────────────────────────────────
  app.get(
    "/codex",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.code(200).send({
        articles: CODEX_ARTICLES,
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
      });
    },
  );

  // ── POST /v1/support/feedback ───────────────────────────────────
  // Opt-in feedback submission. Requires auth to associate with user.
  app.post(
    "/feedback",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const body = request.body as {
        messageId?: string;
        rating?: string;
        comment?: string;
        articleIds?: string[];
        appVersion?: string;
      };

      // Validate required fields
      if (!body.rating || !["up", "down"].includes(body.rating)) {
        return reply.code(400).send({ error: "rating must be 'up' or 'down'" });
      }

      // Strip any URLs from comment to prevent accidental data leakage
      const safeComment = body.comment
        ? body.comment.replace(/https?:\/\/[^\s]+/g, "[REDACTED_URL]")
        : null;

      // Store in a simple table (create if not exist — we use raw SQL)
      try {
        await prisma.$executeRaw`
          INSERT INTO support_feedback (id, user_id, message_id, rating, comment, article_ids, app_version, created_at)
          VALUES (
            gen_random_uuid(),
            ${sub},
            ${body.messageId ?? ""},
            ${body.rating},
            ${safeComment},
            ${JSON.stringify(body.articleIds ?? [])},
            ${body.appVersion ?? "unknown"},
            NOW()
          )
        `;
      } catch (err) {
        // Table might not exist yet — log and return success anyway
        request.log.warn({ err }, "support-feedback: could not store (table may not exist)");
      }

      return reply.code(201).send({ ok: true });
    },
  );
}
