import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  MasterSourceContentResponse,
  MasterSourceDTO,
  MasterSourcesResponse,
} from "@stream-shogun/shared";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  getGeneratedMasterSources,
  loadGeneratedMasterSourceContent,
} from "../../lib/master-epg-providers.js";

function isMasterEmail(email: string | undefined): boolean {
  return email?.trim().toLowerCase() === env.MASTER_EMAIL.trim().toLowerCase();
}

function assertMaster(request: FastifyRequest, reply: FastifyReply): boolean {
  if (isMasterEmail(request.user.email)) return true;

  request.log.warn({ reqId: request.id, userId: request.user.sub }, "master.forbidden");
  reply.code(403).send({ error: "Forbidden", message: "Master profile only" });
  return false;
}

function getMasterSources(): MasterSourceDTO[] {
  const sources: MasterSourceDTO[] = [];

  if (env.MASTER_PLAYLIST_URL) {
    sources.push({
      id: "master-playlist",
      kind: "playlist",
      name: env.MASTER_PLAYLIST_NAME ?? "Master Playlist",
      url: env.MASTER_PLAYLIST_URL,
      loadMode: "url",
    });
  }

  if (env.MASTER_EPG_URL) {
    sources.push({
      id: "master-epg",
      kind: "epg",
      name: env.MASTER_EPG_NAME ?? "Master Guide",
      url: env.MASTER_EPG_URL,
      loadMode: "url",
    });
  }

  sources.push(...getGeneratedMasterSources());

  return sources;
}

export async function masterRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/sources",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!assertMaster(request, reply)) return;

      const response: MasterSourcesResponse = {
        sources: getMasterSources(),
      };

      return reply.code(200).send(response);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/sources/:id/content",
    { preHandler: [authenticate] },
    async (request, reply) => {
      if (!assertMaster(request, reply)) return;

      const source = getMasterSources().find((item) => item.id === request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "NotFound", message: "Master source not found" });
      }

      if (source.loadMode !== "api") {
        return reply.code(400).send({
          error: "BadRequest",
          message: "Master source is URL-backed and should be loaded from its URL",
        });
      }

      let content: string;
      try {
        content = await loadGeneratedMasterSourceContent(source.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load Master source";
        request.log.error({ err: message, sourceId: source.id }, "master.source_content_failed");
        return reply.code(502).send({ error: "BadGateway", message });
      }

      const response: MasterSourceContentResponse = {
        source,
        content,
        fetchedAt: new Date().toISOString(),
      };

      return reply.code(200).send(response);
    },
  );
}
