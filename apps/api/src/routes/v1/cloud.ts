import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  cloudSettingsSchema,
  cloudSyncPutSchema,
  CLOUD_HISTORY_LIMIT,
  type CloudSettingsResponse,
  type CloudSyncPayload,
  type CloudHistoryItem,
} from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";

export async function cloudRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/cloud/settings (legacy) ───────────────────────────

  app.get(
    "/settings",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

      const settings = await prisma.appSettingsCloud.findUnique({
        where: { userId: sub },
      });

      if (!settings) {
        return reply.code(200).send({ settings: null, updatedAt: null } satisfies CloudSettingsResponse);
      }

      const response: CloudSettingsResponse = {
        settings: JSON.parse(settings.blobJson),
        updatedAt: settings.updatedAt.toISOString(),
      };

      return reply.code(200).send(response);
    }
  );

  // ── PUT /v1/cloud/settings (legacy) ───────────────────────────

  app.put(
    "/settings",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(cloudSettingsSchema)],
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const { sub } = request.user;
      const { settings } = request.body as { settings: Record<string, unknown> };

      const updated = await prisma.appSettingsCloud.upsert({
        where: { userId: sub },
        update: { blobJson: JSON.stringify(settings) },
        create: { userId: sub, blobJson: JSON.stringify(settings) },
      });

      const response: CloudSettingsResponse = {
        settings: JSON.parse(updated.blobJson),
        updatedAt: updated.updatedAt.toISOString(),
      };

      return reply.code(200).send(response);
    }
  );

  // ═══════════════════════════════════════════════════════════════
  //  Cloud Sync v1  —  GET + PUT /v1/cloud/sync
  //
  //  Conflict strategy: last-write-wins based on updatedAt.
  //  Client sends `localUpdatedAt`; if the server record is newer
  //  the PUT is rejected with the server payload so the client can
  //  merge and retry.
  // ═══════════════════════════════════════════════════════════════

  // ── GET /v1/cloud/sync ────────────────────────────────────────

  app.get(
    "/sync",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

      const row = await prisma.appSettingsCloud.findUnique({
        where: { userId: sub },
      });

      if (!row) {
        const empty: CloudSyncPayload = {
          settings: null,
          favorites: null,
          history: null,
          updatedAt: null,
        };
        return reply.code(200).send(empty);
      }

      const payload: CloudSyncPayload = {
        settings: safeParse<Record<string, string>>(row.blobJson, null),
        favorites: safeParse<string[]>(row.favoritesJson, null),
        history: safeParse<CloudHistoryItem[]>(row.historyJson, null),
        updatedAt: row.updatedAt.toISOString(),
      };

      return reply.code(200).send(payload);
    }
  );

  // ── PUT /v1/cloud/sync ────────────────────────────────────────

  app.put(
    "/sync",
    {
      preHandler: [authenticate],
      preValidation: [validateBody(cloudSyncPutSchema)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const body = request.body as {
        settings?: Record<string, string>;
        favorites?: string[];
        history?: CloudHistoryItem[];
        localUpdatedAt: string;
      };

      const clientTs = new Date(body.localUpdatedAt);

      // Check for conflict: if server record is newer, return 409
      const existing = await prisma.appSettingsCloud.findUnique({
        where: { userId: sub },
      });

      if (existing && existing.updatedAt > clientTs) {
        // Server wins — return current server state so client can merge
        const conflict: CloudSyncPayload = {
          settings: safeParse<Record<string, string>>(existing.blobJson, null),
          favorites: safeParse<string[]>(existing.favoritesJson, null),
          history: safeParse<CloudHistoryItem[]>(existing.historyJson, null),
          updatedAt: existing.updatedAt.toISOString(),
        };
        return reply.code(409).send(conflict);
      }

      // Build update data — only overwrite fields the client sent
      const updateData: {
        blobJson?: string;
        favoritesJson?: string;
        historyJson?: string;
      } = {};

      if (body.settings !== undefined) {
        updateData.blobJson = JSON.stringify(body.settings);
      }
      if (body.favorites !== undefined) {
        updateData.favoritesJson = JSON.stringify(body.favorites);
      }
      if (body.history !== undefined) {
        // Enforce bounded history
        const bounded = body.history.slice(0, CLOUD_HISTORY_LIMIT);
        updateData.historyJson = JSON.stringify(bounded);
      }

      const row = await prisma.appSettingsCloud.upsert({
        where: { userId: sub },
        update: updateData,
        create: {
          userId: sub,
          blobJson: updateData.blobJson ?? "{}",
          favoritesJson: updateData.favoritesJson ?? "[]",
          historyJson: updateData.historyJson ?? "[]",
        },
      });

      const payload: CloudSyncPayload = {
        settings: safeParse<Record<string, string>>(row.blobJson, null),
        favorites: safeParse<string[]>(row.favoritesJson, null),
        history: safeParse<CloudHistoryItem[]>(row.historyJson, null),
        updatedAt: row.updatedAt.toISOString(),
      };

      return reply.code(200).send(payload);
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function safeParse<T>(json: string, fallback: T | null): T | null {
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    console.warn("[cloud] Failed to parse stored JSON:", (err as Error).message);
    return fallback;
  }
}
