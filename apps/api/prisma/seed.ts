import { PrismaClient, Plan, SubscriptionStatus } from "../generated/prisma/index.js";
import { ALL_ACHIEVEMENTS } from "./achievements.js";

const prisma = new PrismaClient();

// ── Badge definitions ───────────────────────────────────────────────
const BADGES = [
  {
    key: "founding_member",
    name: "Founding Member",
    description: "One of the first StreamShōgun users",
    icon: "👑",
    color: "#f59e0b",
  },
  {
    key: "pro_user",
    name: "Pro User",
    description: "Active Pro subscription",
    icon: "⚡",
    color: "#7c5cfc",
  },
  {
    key: "contributor",
    name: "Contributor",
    description: "Contributed to the StreamShōgun project",
    icon: "🛠️",
    color: "#22c55e",
  },
  {
    key: "bug_hunter",
    name: "Bug Hunter",
    description: "Reported a confirmed bug",
    icon: "🐛",
    color: "#ef4444",
  },
  {
    key: "community_star",
    name: "Community Star",
    description: "Outstanding community member",
    icon: "⭐",
    color: "#3b82f6",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database.");
  }
  console.log("🌱 Seeding database …");

  // Create a demo user for local development.
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@streamshogun.com" },
    update: {},
    create: {
      email: "demo@streamshogun.com",
      username: "demo",
      // bcrypt hash for the local demo user (12 rounds)
      passwordHash: "$2b$12$LJ3m4ys3Lk0TB8VZ8qMwXOFCZpHg5bGpFdHb2PXOzJ1L3x4nHGjgS",
      displayName: "Demo User",
    },
  });

  // Give demo user a FREE subscription
  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      plan: Plan.FREE,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  // Seed achievements (batch upsert for speed with 1000+ entries)
  let achCount = 0;
  for (const a of ALL_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      update: {
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        sortOrder: a.sortOrder,
      },
      create: a,
    });
    achCount++;
    if (achCount % 100 === 0) console.log(`    … ${achCount} achievements upserted`);
  }
  console.log(`  ✅ Seeded ${ALL_ACHIEVEMENTS.length} achievements`);

  // Seed badges
  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { key: b.key },
      update: { name: b.name, description: b.description, icon: b.icon, color: b.color },
      create: b,
    });
  }
  console.log(`  ✅ Seeded ${BADGES.length} badges`);

  // Create demo profile
  await prisma.profile.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      bio: "Just a demo user exploring **StreamShōgun**! 🎮\n\nI love watching live TV and discovering new channels.",
      location: "Tokyo, Japan",
    },
  });

  console.log(`✅ Seeded demo user: ${demoUser.email} (id: ${demoUser.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
