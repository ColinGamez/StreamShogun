// ── Shared API schemas & types ─────────────────────────────────────────
//
// Consumed by both the API server and the desktop/UI client.

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════
//  Enums
// ═══════════════════════════════════════════════════════════════════════

export const Plan = {
  FREE: "FREE",
  PRO: "PRO",
} as const;
export type Plan = (typeof Plan)[keyof typeof Plan];

export const SubscriptionStatus = {
  ACTIVE: "ACTIVE",
  CANCELED: "CANCELED",
  PAST_DUE: "PAST_DUE",
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

// ═══════════════════════════════════════════════════════════════════════
//  Feature flag keys (keep in sync with desktop Feature enum values)
// ═══════════════════════════════════════════════════════════════════════

export const FLAG_KEYS = [
  "auto_refresh",
  "multi_epg_merge",
  "smart_matching",
  "pip_window",
  "discord_rpc",
  "cloud_sync",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

// ═══════════════════════════════════════════════════════════════════════
//  Request schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════

export const registerSchema = z.object({
  email: z.string().email("Invalid email").max(255).trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email").trim().toLowerCase(),
  password: z.string().min(1, "Password required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const cloudSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});
export type CloudSettingsInput = z.infer<typeof cloudSettingsSchema>;

// ── Cloud Sync v1 ─────────────────────────────────────────────────────

/** A single recent-history entry synced to the cloud. */
export const cloudHistoryItemSchema = z.object({
  channelUrl: z.string(),
  channelName: z.string(),
  channelLogo: z.string().optional().default(""),
  groupTitle: z.string().optional().default(""),
  watchedAt: z.number(), // epoch ms
});
export type CloudHistoryItem = z.infer<typeof cloudHistoryItemSchema>;

/** Max recent-history entries stored in cloud. */
export const CLOUD_HISTORY_LIMIT = 50;

export const cloudSyncPutSchema = z.object({
  settings: z.record(z.string()).optional(),
  favorites: z.array(z.string()).optional(),
  history: z.array(cloudHistoryItemSchema).max(CLOUD_HISTORY_LIMIT).optional(),
  localUpdatedAt: z.string().datetime({ message: "ISO-8601 datetime required" }),
});
export type CloudSyncPutInput = z.infer<typeof cloudSyncPutSchema>;

// ═══════════════════════════════════════════════════════════════════════
//  Response types (plain TS interfaces)
// ═══════════════════════════════════════════════════════════════════════

export interface UserDTO {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
}

export interface SubscriptionDTO {
  plan: Plan;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface AuthResponse {
  user: UserDTO;
  subscription: SubscriptionDTO;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  user: UserDTO;
  subscription: SubscriptionDTO;
}

export interface FeaturesResponse {
  plan: Plan;
  flags: Record<string, boolean>;
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
  };
}

export interface CloudSettingsResponse {
  settings: Record<string, unknown> | null;
  updatedAt: string | null;
}

/** GET/PUT /v1/cloud/sync response payload. */
export interface CloudSyncPayload {
  settings: Record<string, string> | null;
  favorites: string[] | null;
  history: CloudHistoryItem[] | null;
  updatedAt: string | null;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  db: boolean;
  uptime: number;
  version: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}
