// ── Profile API routes (/v1/profile) ──────────────────────────────────
//
// Public:  GET  /v1/profile/:username            → public profile
//          GET  /v1/profile/:username/achievements → achievement grid
// Private: PUT  /v1/profile                      → update own profile
//          PUT  /v1/profile/username              → set / change username
//          GET  /v1/profile                       → own profile (authed)

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  updateProfileSchema,
  setUsernameSchema,
  RESERVED_USERNAMES,
  Plan,
  type PublicProfileDTO,
  type MyProfileDTO,
  type ProfileAchievementsResponse,
  type ProfileStatsDTO,
  type BadgeDTO,
  type AchievementDTO,
} from "@stream-shogun/shared";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../../middleware/authenticate.js";
import { evaluateAchievements } from "../../lib/achievements.js";

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip dangerous HTML/script tags from markdown for safe rendering. */
function sanitizeBio(raw: string): string {
  // Remove <script>, <iframe>, <object>, <embed>, <form>, event handlers
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?\/?>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript\s*:/gi, "");
}

/** Build stats from cloud data. */
async function buildStats(userId: string): Promise<ProfileStatsDTO> {
  const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
  let playlists = 0;
  let channels = 0;
  let favoriteCount = 0;
  let watchTimeMinutes = 0;

  if (cloud) {
    try {
      const blob = JSON.parse(cloud.blobJson) as Record<string, unknown>;
      const pls = blob.playlists;
      if (Array.isArray(pls)) {
        playlists = pls.length;
        channels = pls.reduce((sum: number, pl: Record<string, unknown>) => {
          const ch = pl.channels;
          return sum + (Array.isArray(ch) ? ch.length : 0);
        }, 0);
      }
    } catch {
      /* ignore parse errors */
    }

    try {
      const favs = JSON.parse(cloud.favoritesJson) as unknown[];
      favoriteCount = favs.length;
    } catch {
      /* ignore */
    }

    try {
      const history = JSON.parse(cloud.historyJson) as { watchedAt?: number }[];
      // Estimate ~5 min per history entry as approximate watch time
      watchTimeMinutes = history.length * 5;
    } catch {
      /* ignore */
    }
  }

  return { playlists, channels, watchTimeMinutes, favoriteCount };
}

/** Build badges array for a user. */
async function buildBadges(userId: string): Promise<BadgeDTO[]> {
  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { awardedAt: "desc" },
  });
  return userBadges.map((ub) => ({
    key: ub.badge.key,
    name: ub.badge.name,
    description: ub.badge.description,
    icon: ub.badge.icon,
    color: ub.badge.color,
    awardedAt: ub.awardedAt.toISOString(),
  }));
}

// ── Route registration ──────────────────────────────────────────────

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /v1/profile (own profile, authed) ─────────────────────

  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;

      const user = await prisma.user.findUnique({
        where: { id: sub },
        include: { profile: true, subscription: true },
      });
      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }

      // Evaluate achievements in background (fire-and-forget)
      void evaluateAchievements(sub);

      const stats = await buildStats(sub);
      const badges = await buildBadges(sub);

      const response: MyProfileDTO = {
        username: user.username ?? "",
        displayName: user.displayName ?? null,
        email: user.email,
        avatarUrl: user.profile?.avatarUrl ?? null,
        bio: user.profile?.bio ?? null,
        location: user.profile?.location ?? null,
        website: user.profile?.website ?? null,
        plan: user.subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE,
        joinDate: user.createdAt.toISOString(),
        badges,
        stats,
      };

      return reply.code(200).send(response);
    },
  );

  // ── GET /v1/profile/:username (public) ────────────────────────

  app.get(
    "/:username",
    async (request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) => {
      const { username } = request.params;

      const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
        include: { profile: true, subscription: true },
      });

      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }

      const stats = await buildStats(user.id);
      const badges = await buildBadges(user.id);

      const response: PublicProfileDTO = {
        username: user.username!,
        displayName: user.displayName ?? null,
        avatarUrl: user.profile?.avatarUrl ?? null,
        bio: user.profile?.bio ?? null,
        location: user.profile?.location ?? null,
        website: user.profile?.website ?? null,
        plan: user.subscription?.plan === "PRO" ? Plan.PRO : Plan.FREE,
        joinDate: user.createdAt.toISOString(),
        badges,
        stats,
      };

      // Cache public profiles for 60s
      void reply.header("Cache-Control", "public, max-age=60, s-maxage=60");
      return reply.code(200).send(response);
    },
  );

  // ── GET /v1/profile/:username/achievements ────────────────────

  app.get(
    "/:username/achievements",
    async (request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) => {
      const { username } = request.params;

      const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase() },
      });
      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }

      // Fetch all global achievements
      const allAchievements = await prisma.achievement.findMany({
        orderBy: { sortOrder: "asc" },
      });

      // Fetch user's unlocked achievements
      const unlocked = await prisma.userAchievement.findMany({
        where: { userId: user.id },
        select: { achievementId: true, unlockedAt: true },
      });
      const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

      const achievements: AchievementDTO[] = allAchievements.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        unlockedAt: unlockedMap.get(a.id)?.toISOString() ?? null,
      }));

      // Cache for 60s
      void reply.header("Cache-Control", "public, max-age=60, s-maxage=60");

      const response: ProfileAchievementsResponse = { achievements };
      return reply.code(200).send(response);
    },
  );

  // ── PUT /v1/profile (update own profile) ──────────────────────

  app.put(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const result = updateProfileSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({
          error: "Validation Error",
          details: result.error.flatten().fieldErrors,
        });
      }

      const { displayName, bio, location, website, avatarUrl } = result.data;

      // Sanitize bio markdown
      const safeBio = bio !== undefined ? sanitizeBio(bio) : undefined;

      const normalizedDisplayName =
        displayName !== undefined ? displayName.trim() || null : undefined;

      const [, profile] = await prisma.$transaction([
        prisma.user.update({
          where: { id: sub },
          data: {
            ...(normalizedDisplayName !== undefined && {
              displayName: normalizedDisplayName,
            }),
          },
        }),
        prisma.profile.upsert({
          where: { userId: sub },
          update: {
            ...(safeBio !== undefined && { bio: safeBio }),
            ...(location !== undefined && { location }),
            ...(website !== undefined && { website: website || null }),
            ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
          },
          create: {
            userId: sub,
            bio: safeBio ?? null,
            location: location ?? null,
            website: website || null,
            avatarUrl: avatarUrl || null,
          },
        }),
      ]);

      // Re-evaluate achievements (profile_complete, social_butterfly)
      void evaluateAchievements(sub);

      return reply.code(200).send({
        displayName: normalizedDisplayName,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
      });
    },
  );

  // ── PUT /v1/profile/username (set / change username) ──────────

  app.put(
    "/username",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sub } = request.user;
      const result = setUsernameSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({
          error: "Validation Error",
          details: result.error.flatten().fieldErrors,
        });
      }

      const username = result.data.username.toLowerCase();

      // Check reserved
      if (RESERVED_USERNAMES.has(username)) {
        return reply.code(409).send({
          error: "Conflict",
          message: "This username is not available",
        });
      }

      // Check uniqueness
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== sub) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Username already taken",
        });
      }

      await prisma.user.update({
        where: { id: sub },
        data: { username },
      });

      void evaluateAchievements(sub);

      return reply.code(200).send({ username });
    },
  );
}
