// ── Achievement auto-grant engine ──────────────────────────────────────
//
// Checks whether a user qualifies for achievements they haven't yet
// unlocked, and grants them atomically.  Called after relevant mutations
// (first stream, playlist creation, subscription upgrade, etc.).

import { prisma } from "./prisma.js";

/**
 * Snapshot of everything the checks need, loaded once per evaluation.
 * Previously every check re-queried the database (~60 sequential round-trips
 * per run); now the checks are pure functions over this snapshot.
 */
export interface AchievementContext {
  /** Parsed cloud history entries (empty when missing/corrupt). */
  history: { channelId?: string; name?: string; watchedAt?: number }[];
  /** Parsed cloud settings blob (empty object when missing/corrupt). */
  blob: Record<string, unknown>;
  /** Parsed cloud favorites (empty when missing/corrupt). */
  favorites: unknown[];
  /** Whether any cloud row exists at all. */
  hasCloud: boolean;
  /** Account creation date, or null when the user row is missing. */
  accountCreatedAt: Date | null;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  website: string | null;
  location: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  /** Achievements already owned (grows as this run grants). */
  ownedCount: number;
  badgeCount: number;
}

function parseJsonArray(raw: unknown): unknown[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function uniqueChannelCount(history: AchievementContext["history"]): number {
  return new Set(history.map((h) => h.channelId ?? h.name).filter(Boolean)).size;
}

function playlistCount(blob: Record<string, unknown>): number {
  const playlists = blob.playlists;
  return Array.isArray(playlists) ? playlists.length : 0;
}

function watchHours(blob: Record<string, unknown>): number {
  return typeof blob.totalWatchHours === "number" ? blob.totalWatchHours : 0;
}

function watchedHour(history: AchievementContext["history"], from: number, to: number): boolean {
  return history.some((h) => {
    if (!h.watchedAt) return false;
    const hour = new Date(h.watchedAt).getUTCHours();
    return hour >= from && hour < to;
  });
}

function accountAgeDays(createdAt: Date | null): number {
  if (!createdAt) return -1;
  return (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Achievement definitions keyed by their unique `key`.
 * The `check` function is pure over the snapshot context.
 */
interface AchievementCheck {
  key: string;
  check: (ctx: AchievementContext) => boolean;
}

const CHECKS: AchievementCheck[] = [
  // ── Streaming ──
  {
    key: "first_stream",
    check: (ctx) => ctx.hasCloud && ctx.history.length > 0,
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
    check: (ctx: AchievementContext) => ctx.hasCloud && uniqueChannelCount(ctx.history) >= n,
  })),
  // ── Playlists ──
  {
    key: "first_playlist",
    check: (ctx) => ctx.hasCloud && playlistCount(ctx.blob) >= 1,
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
    check: (ctx: AchievementContext) => ctx.hasCloud && playlistCount(ctx.blob) >= n,
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
    check: (ctx: AchievementContext) => ctx.hasCloud && watchHours(ctx.blob) >= hrs,
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
    check: (ctx: AchievementContext) => ctx.hasCloud && ctx.favorites.length >= n,
  })),
  // ── Account & subscription ──
  {
    key: "pro_member",
    check: (ctx) => ctx.subscriptionPlan === "PRO" && ctx.subscriptionStatus === "ACTIVE",
  },
  {
    key: "account_created",
    check: (ctx) => ctx.accountCreatedAt !== null,
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
    check: (ctx: AchievementContext) => accountAgeDays(ctx.accountCreatedAt) >= days,
  })),
  // ── Time-of-day ──
  {
    key: "night_owl",
    check: (ctx) => ctx.hasCloud && watchedHour(ctx.history, 0, 4),
  },
  {
    key: "watch_morning",
    check: (ctx) => ctx.hasCloud && watchedHour(ctx.history, 5, 8),
  },
  // ── Profile & Social ──
  {
    key: "profile_complete",
    check: (ctx) => !!(ctx.username && ctx.displayName && ctx.bio && ctx.avatarUrl),
  },
  {
    key: "social_butterfly",
    check: (ctx) => !!ctx.website,
  },
  {
    key: "username_set",
    check: (ctx) => !!ctx.username,
  },
  {
    key: "avatar_set",
    check: (ctx) => !!ctx.avatarUrl,
  },
  {
    key: "bio_set",
    check: (ctx) => !!ctx.bio,
  },
  {
    key: "location_set",
    check: (ctx) => !!ctx.location,
  },
  // ── Cloud sync ──
  {
    key: "cloud_syncer",
    check: (ctx) => ctx.hasCloud,
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
    // NOTE: evaluated against the running total (owned + granted earlier in
    // this same run), mirroring the old live-count behaviour.
    check: (ctx: AchievementContext) => ctx.ownedCount >= n,
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
    check: (ctx: AchievementContext) => ctx.ownedCount >= n,
  })),
  // ── Badge meta ──
  ...[
    { key: "first_badge", n: 1 },
    { key: "badges_3", n: 3 },
    { key: "badges_5", n: 5 },
  ].map(({ key, n }) => ({
    key,
    check: (ctx: AchievementContext) => ctx.badgeCount >= n,
  })),
];

/**
 * Load everything the checks need in a handful of parallel queries.
 */
async function loadAchievementContext(userId: string): Promise<{
  ctx: AchievementContext;
  owned: Set<string>;
}> {
  const [user, cloud, subscription, ownedRows, badgeCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        username: true,
        displayName: true,
        profile: {
          select: { bio: true, avatarUrl: true, website: true, location: true },
        },
      },
    }),
    prisma.appSettingsCloud.findUnique({ where: { userId } }),
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievement: { select: { key: true } } },
    }),
    prisma.userBadge.count({ where: { userId } }),
  ]);

  const owned = new Set(ownedRows.map((ua) => ua.achievement.key));
  const ctx: AchievementContext = {
    history: cloud ? (parseJsonArray(cloud.historyJson) as AchievementContext["history"]) : [],
    blob: cloud ? parseJsonObject(cloud.blobJson) : {},
    favorites: cloud ? parseJsonArray(cloud.favoritesJson) : [],
    hasCloud: !!cloud,
    accountCreatedAt: user?.createdAt ?? null,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    bio: user?.profile?.bio ?? null,
    avatarUrl: user?.profile?.avatarUrl ?? null,
    website: user?.profile?.website ?? null,
    location: user?.profile?.location ?? null,
    subscriptionPlan: subscription?.plan ?? null,
    subscriptionStatus: subscription?.status ?? null,
    ownedCount: owned.size,
    badgeCount,
  };
  return { ctx, owned };
}

/**
 * Evaluate all achievement checks for a user and grant any newly qualified ones.
 * Returns the keys of any achievements granted in this run.
 */
export async function evaluateAchievements(userId: string): Promise<string[]> {
  const { ctx, owned } = await loadAchievementContext(userId);

  const granted: string[] = [];

  for (const { key, check } of CHECKS) {
    if (owned.has(key)) continue; // already unlocked

    let qualifies: boolean;
    try {
      qualifies = check(ctx);
    } catch {
      // Individual check failures shouldn't block other checks
      continue;
    }
    if (!qualifies) continue;

    // Look up the achievement definition
    const achievement = await prisma.achievement.findUnique({ where: { key } });
    if (!achievement) continue;

    // Grant it (a parallel run racing us hits the unique constraint and
    // is skipped via the catch below)
    try {
      await prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });
    } catch {
      continue;
    }
    owned.add(key);
    ctx.ownedCount += 1;
    granted.push(key);
  }

  return granted;
}
