// ── Prisma seed — default feature flags for new users ─────────────────

import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

/** Default feature flags seeded for every new user. */
export const DEFAULT_FLAGS = [
  "discord_rpc",
  "multi_epg_merge",
  "fuzzy_matching",
  "pip_window",
  "auto_refresh",
] as const;

async function main() {
  console.warn("🌱 Seed: nothing to seed globally. Flags are per-user.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
