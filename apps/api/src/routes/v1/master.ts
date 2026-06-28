import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { MasterSourceDTO, MasterSourcesResponse } from "@stream-shogun/shared";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";

function isMasterEmail(email: string | undefined): boolean {
  return email?.trim().toLowerCase() === env.MASTER_EMAIL.trim().toLowerCase();
}

function getMasterSources(): MasterSourceDTO[] {
  const sources: MasterSourceDTO[] = [];

  if (env.MASTER_PLAYLIST_URL) {
    sources.push({
      id: "master-playlist",
      kind: "playlist",
      name: env.MASTER_PLAYLIST_NAME ?? "Master Playlist",
      url: env.MASTER_PLAYLIST_URL,
    });
  }

  if (env.MASTER_EPG_URL) {
    sources.push({
      id: "master-epg",
      kind: "epg",
      name: env.MASTER_EPG_NAME ?? "Master Guide",
      url: env.MASTER_EPG_URL,
    });
  }

  return sources;
}

export async function masterRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/sources",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isMasterEmail(request.user.email)) {
        request.log.warn(
          { reqId: request.id, userId: request.user.sub },
          "master.sources_forbidden",
        );
        return reply.code(403).send({ error: "Forbidden", message: "Master profile only" });
      }

      const response: MasterSourcesResponse = {
        sources: getMasterSources(),
      };

      return reply.code(200).send(response);
    },
  );
}
