import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    MASTER_EMAIL: "colin.kenny777@gmail.com",
    MASTER_PLAYLIST_NAME: "Private Channels",
    MASTER_PLAYLIST_URL: "https://private.example.com/channels.m3u8",
    MASTER_EPG_NAME: "Private Guide",
    MASTER_EPG_URL: "https://private.example.com/guide.xml.gz",
    MASTER_JAPAN_BANGUMI_NAME: "Japan Bangumi",
    MASTER_JAPAN_BANGUMI_ENABLED: "true",
  },
}));

const jwtSecretForTest = ["master", "routes", "jwt", "test", "secret"].join("-");

async function buildTestApp() {
  const { masterRoutes } = await import("./master.js");
  const app = Fastify();
  await app.register(jwt, { secret: jwtSecretForTest });
  await app.register(masterRoutes, { prefix: "/v1/master" });
  return app;
}

describe("master routes", () => {
  it("rejects non-master users", async () => {
    const app = await buildTestApp();
    const token = app.jwt.sign({ sub: "user_regular", email: "viewer@example.com" });

    const response = await app.inject({
      method: "GET",
      url: "/v1/master/sources",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Forbidden",
      message: "Master profile only",
    });

    await app.close();
  });

  it("returns private sources to the configured master email", async () => {
    const app = await buildTestApp();
    const token = app.jwt.sign({ sub: "user_master", email: "COLIN.KENNY777@gmail.com" });

    const response = await app.inject({
      method: "GET",
      url: "/v1/master/sources",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sources: [
        {
          id: "master-playlist",
          kind: "playlist",
          name: "Private Channels",
          loadMode: "url",
          url: "https://private.example.com/channels.m3u8",
        },
        {
          id: "master-epg",
          kind: "epg",
          name: "Private Guide",
          loadMode: "url",
          url: "https://private.example.com/guide.xml.gz",
        },
        {
          id: "japan-bangumi-tokyo-terrestrial",
          kind: "epg",
          name: "Japan Bangumi",
          loadMode: "api",
          description: "Tokyo terrestrial XMLTV generated from bangumi.org.",
        },
      ],
    });

    await app.close();
  });

  it("does not proxy URL-backed sources through the generated content route", async () => {
    const app = await buildTestApp();
    const token = app.jwt.sign({ sub: "user_master", email: "colin.kenny777@gmail.com" });

    const response = await app.inject({
      method: "GET",
      url: "/v1/master/sources/master-epg/content",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "BadRequest",
      message: "Master source is URL-backed and should be loaded from its URL",
    });

    await app.close();
  });
});
