// ── DB barrel export ──────────────────────────────────────────────────
export { initDatabase, closeDatabase, getDb } from "./database";
export * from "./repositories";
export type { WatchHistoryRow } from "./repositories";
