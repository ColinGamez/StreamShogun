import { PrismaClient, Plan, SubscriptionStatus } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed a production database.");
  }
  console.log("🌱 Seeding database …");

  // Create a demo user (password: "demo1234")
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@streamshogun.com" },
    update: {},
    create: {
      email: "demo@streamshogun.com",
      // bcrypt hash of "demo1234" (12 rounds)
      passwordHash:
        "$2b$12$LJ3m4ys3Lk0TB8VZ8qMwXOFCZpHg5bGpFdHb2PXOzJ1L3x4nHGjgS",
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

  console.log(`✅ Seeded demo user: ${demoUser.email} (id: ${demoUser.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
