import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: { findUnique: vi.fn() },
  appSettingsCloud: { findUnique: vi.fn() },
  subscription: { findUnique: vi.fn() },
  userAchievement: { findMany: vi.fn(), create: vi.fn() },
  userBadge: { count: vi.fn() },
  achievement: { findUnique: vi.fn() },
};

vi.mock("./prisma.js", () => ({
  prisma: prismaMock,
}));

async function loadModule() {
  return import("./achievements.js");
}

function mockWorld(
  overrides: {
    user?: unknown;
    cloud?: unknown;
    subscription?: unknown;
    ownedKeys?: string[];
    badgeCount?: number;
    definitions?: Record<string, string>;
  } = {},
) {
  const {
    user = {
      createdAt: new Date(Date.now() - 400 * 86400_000),
      username: "colin",
      displayName: "Colin",
    },
    cloud = {
      historyJson: JSON.stringify([{ channelId: "news", watchedAt: Date.now() }]),
      blobJson: JSON.stringify({ playlists: [{}, {}], totalWatchHours: 6 }),
      favoritesJson: JSON.stringify(["a", "b", "c", "d", "e", "f"]),
    },
    subscription = { plan: "PRO", status: "ACTIVE" },
    ownedKeys = [],
    badgeCount = 0,
    definitions = {},
  } = overrides;

  prismaMock.user.findUnique.mockResolvedValue(user);
  prismaMock.appSettingsCloud.findUnique.mockResolvedValue(cloud);
  prismaMock.subscription.findUnique.mockResolvedValue(subscription);
  prismaMock.userAchievement.findMany.mockResolvedValue(
    ownedKeys.map((key) => ({ achievement: { key } })),
  );
  prismaMock.userBadge.count.mockResolvedValue(badgeCount);
  prismaMock.userAchievement.create.mockImplementation(async ({ data }: any) => ({
    id: `ua_${data.achievementId}`,
  }));
  prismaMock.achievement.findUnique.mockImplementation(async ({ where }: any) => {
    if (!(where.key in definitions)) return null;
    return { id: definitions[where.key] };
  });
}

describe("evaluateAchievements (batched)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants qualifying achievements with a handful of queries", async () => {
    mockWorld({
      ownedKeys: [],
      definitions: {
        first_stream: "a1",
        account_created: "a2",
        pro_member: "a3",
        stream_10: "a4",
        playlist_3: "a5",
        watch_5hr: "a6",
        first_favorite: "a7",
      },
    });
    const { evaluateAchievements } = await loadModule();

    const granted = await evaluateAchievements("user_1");

    expect(granted).toContain("first_stream");
    expect(granted).toContain("account_created");
    expect(granted).toContain("pro_member");
    // Batched reads: one of each, no per-check round-trips
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.appSettingsCloud.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.subscription.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.userAchievement.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.userBadge.count).toHaveBeenCalledTimes(1);
    // Definitions resolved only for qualifying checks: every grant was
    // looked up, and non-qualifying checks (e.g. stream_25 with one
    // unique channel) never hit the database.
    const lookedUp = prismaMock.achievement.findUnique.mock.calls.map((c) => c[0].where.key);
    for (const key of granted) expect(lookedUp).toContain(key);
    expect(lookedUp).not.toContain("stream_25");
    expect(lookedUp).not.toContain("playlist_50");
  });

  it("skips already-owned achievements", async () => {
    mockWorld({ ownedKeys: ["first_stream", "account_created"], definitions: {} });
    const { evaluateAchievements } = await loadModule();

    const granted = await evaluateAchievements("user_1");

    expect(granted).not.toContain("first_stream");
    expect(prismaMock.achievement.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "first_stream" } }),
    );
  });

  it("counts in-run grants toward meta thresholds", async () => {
    // 9 owned + first_stream grant in this run => achievements_10 unlocks too
    mockWorld({
      ownedKeys: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      definitions: { first_stream: "a1", achievements_10: "a2" },
    });
    const { evaluateAchievements } = await loadModule();

    const granted = await evaluateAchievements("user_1");

    expect(granted).toContain("first_stream");
    expect(granted).toContain("achievements_10");
  });

  it("handles missing cloud and user rows without throwing", async () => {
    mockWorld({ user: null, cloud: null, subscription: null, ownedKeys: [], definitions: {} });
    const { evaluateAchievements } = await loadModule();

    await expect(evaluateAchievements("ghost")).resolves.toEqual([]);
  });
});
