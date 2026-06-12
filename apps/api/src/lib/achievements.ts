// ── Achievement auto-grant engine ──────────────────────────────────────
//
// Checks whether a user qualifies for achievements they haven't yet
// unlocked, and grants them atomically.  Called after relevant mutations
// (first stream, playlist creation, subscription upgrade, etc.).

import { prisma } from "./prisma.js";

/**
 * Achievement definitions keyed by their unique `key`.
 * The `check` function returns `true` if the user qualifies.
 */
interface AchievementCheck {
  key: string;
  check: (userId: string) => Promise<boolean>;
}

const CHECKS: AchievementCheck[] = [
  // ── Streaming ──
  {
    key: "first_stream",
    check: async (userId) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const history = JSON.parse(cloud.historyJson) as unknown[];
        return history.length > 0;
      } catch {
        return false;
      }
    },
  },
  // Milestone: watched N unique channels
  ...[
    { key: "stream_10", n: 10 },
    { key: "stream_25", n: 25 },
    { key: "stream_50", n: 50 },
    { key: "stream_100", n: 100 },
    { key: "stream_250", n: 250 },
    { key: "stream_500", n: 500 },
    { key: "stream_1000", n: 1000 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const history = JSON.parse(cloud.historyJson) as { channelId?: string; name?: string }[];
        const unique = new Set(history.map((h) => h.channelId ?? h.name).filter(Boolean));
        return unique.size >= n;
      } catch {
        return false;
      }
    },
  })),
  // ── Playlists ──
  {
    key: "first_playlist",
    check: async (userId) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const blob = JSON.parse(cloud.blobJson) as Record<string, unknown>;
        const playlists = blob.playlists;
        return Array.isArray(playlists) && playlists.length >= 1;
      } catch {
        return false;
      }
    },
  },
  // Playlist milestones
  ...[
    { key: "playlist_3", n: 3 },
    { key: "playlist_5", n: 5 },
    { key: "10_playlists", n: 10 },
    { key: "playlist_15", n: 15 },
    { key: "playlist_20", n: 20 },
    { key: "playlist_25", n: 25 },
    { key: "playlist_50", n: 50 },
    { key: "playlist_75", n: 75 },
    { key: "playlist_100", n: 100 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const blob = JSON.parse(cloud.blobJson) as Record<string, unknown>;
        const playlists = blob.playlists;
        return Array.isArray(playlists) && playlists.length >= n;
      } catch {
        return false;
      }
    },
  })),
  // ── Watch time (from history) ──
  ...[
    { key: "watch_1hr", hrs: 1 },
    { key: "watch_5hr", hrs: 5 },
    { key: "watch_10hr", hrs: 10 },
    { key: "watch_24hr", hrs: 24 },
    { key: "watch_100hr", hrs: 100 },
    { key: "watch_500hr", hrs: 500 },
    { key: "watch_1000hr", hrs: 1000 },
    { key: "marathon_viewer", hrs: 100 },
  ].map(({ key, hrs }) => ({
    key,
    check: async (userId: string) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const blob = JSON.parse(cloud.blobJson) as Record<string, unknown>;
        const watchHours = typeof blob.totalWatchHours === "number" ? blob.totalWatchHours : 0;
        return watchHours >= hrs;
      } catch {
        return false;
      }
    },
  })),
  // ── Favorites ──
  ...[
    { key: "first_favorite", n: 1 },
    { key: "favorite_5", n: 5 },
    { key: "favorite_10", n: 10 },
    { key: "favorite_25", n: 25 },
    { key: "favorite_50", n: 50 },
    { key: "favorite_100", n: 100 },
    { key: "favorite_250", n: 250 },
    { key: "favorite_500", n: 500 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const favorites = JSON.parse(cloud.favoritesJson) as unknown[];
        return Array.isArray(favorites) && favorites.length >= n;
      } catch {
        return false;
      }
    },
  })),
  // ── Account & subscription ──
  {
    key: "pro_member",
    check: async (userId) => {
      const sub = await prisma.subscription.findUnique({ where: { userId } });
      return sub?.plan === "PRO" && sub.status === "ACTIVE";
    },
  },
  {
    key: "account_created",
    check: async (userId) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return !!user;
    },
  },
  // Account age milestones
  ...[
    { key: "account_1_week", days: 7 },
    { key: "account_1_month", days: 30 },
    { key: "account_3_months", days: 90 },
    { key: "account_6_months", days: 180 },
    { key: "account_1_year", days: 365 },
    { key: "account_2_years", days: 730 },
  ].map(({ key, days }) => ({
    key,
    check: async (userId: string) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return false;
      const age = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return age >= days;
    },
  })),
  // ── Time-of-day ──
  {
    key: "night_owl",
    check: async (userId) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const history = JSON.parse(cloud.historyJson) as { watchedAt?: number }[];
        return history.some((h) => {
          if (!h.watchedAt) return false;
          const hour = new Date(h.watchedAt).getUTCHours();
          return hour >= 0 && hour < 4;
        });
      } catch {
        return false;
      }
    },
  },
  {
    key: "watch_morning",
    check: async (userId) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      if (!cloud) return false;
      try {
        const history = JSON.parse(cloud.historyJson) as { watchedAt?: number }[];
        return history.some((h) => {
          if (!h.watchedAt) return false;
          const hour = new Date(h.watchedAt).getUTCHours();
          return hour >= 5 && hour < 8;
        });
      } catch {
        return false;
      }
    },
  },
  // ── Profile & Social ──
  {
    key: "profile_complete",
    check: async (userId) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
      if (!user?.profile) return false;
      return !!(user.username && user.displayName && user.profile.bio && user.profile.avatarUrl);
    },
  },
  {
    key: "social_butterfly",
    check: async (userId) => {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return !!profile?.website;
    },
  },
  {
    key: "username_set",
    check: async (userId) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return !!user?.username;
    },
  },
  {
    key: "avatar_set",
    check: async (userId) => {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return !!profile?.avatarUrl;
    },
  },
  {
    key: "bio_set",
    check: async (userId) => {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return !!profile?.bio;
    },
  },
  {
    key: "location_set",
    check: async (userId) => {
      const profile = await prisma.profile.findUnique({ where: { userId } });
      return !!profile?.location;
    },
  },
  // ── Cloud sync ──
  {
    key: "cloud_syncer",
    check: async (userId) => {
      const cloud = await prisma.appSettingsCloud.findUnique({ where: { userId } });
      return !!cloud;
    },
  },
  // ── Achievement meta ──
  ...[
    { key: "first_achievement", n: 1 },
    { key: "achievements_10", n: 10 },
    { key: "achievements_25", n: 25 },
    { key: "achievements_50", n: 50 },
    { key: "achievements_100", n: 100 },
    { key: "achievements_200", n: 200 },
    { key: "achievements_300", n: 300 },
    { key: "achievements_500", n: 500 },
    { key: "achievements_1000", n: 1000 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const count = await prisma.userAchievement.count({ where: { userId } });
      return count >= n;
    },
  })),
  // ── Grandmaster ranks ──
  ...[
    { key: "gm_ashigaru", n: 100 },
    { key: "gm_ronin", n: 200 },
    { key: "gm_samurai", n: 400 },
    { key: "gm_daimyo", n: 600 },
    { key: "gm_shogun", n: 800 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const count = await prisma.userAchievement.count({ where: { userId } });
      return count >= n;
    },
  })),
  // ── Badge meta ──
  ...[
    { key: "first_badge", n: 1 },
    { key: "badges_3", n: 3 },
    { key: "badges_5", n: 5 },
  ].map(({ key, n }) => ({
    key,
    check: async (userId: string) => {
      const count = await prisma.userBadge.count({ where: { userId } });
      return count >= n;
    },
  })),
];

/**
 * Evaluate all achievement checks for a user and grant any newly qualified ones.
 * Returns the keys of any achievements granted in this run.
 */
export async function evaluateAchievements(userId: string): Promise<string[]> {
  // Fetch all achievements the user already has
  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievement: { select: { key: true } } },
  });
  const owned = new Set(existing.map((ua) => ua.achievement.key));

  const granted: string[] = [];

  for (const { key, check } of CHECKS) {
    if (owned.has(key)) continue; // already unlocked

    try {
      const qualifies = await check(userId);
      if (!qualifies) continue;

      // Look up the achievement definition
      const achievement = await prisma.achievement.findUnique({ where: { key } });
      if (!achievement) continue;

      // Grant it
      await prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });
      granted.push(key);
    } catch {
      // Individual check failures shouldn't block other checks
    }
  }

  return granted;
}
