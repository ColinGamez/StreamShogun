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
  TRIALING: "TRIALING",
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BillingInterval = {
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
} as const;
export type BillingInterval = (typeof BillingInterval)[keyof typeof BillingInterval];

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
  "unlimited_playlists",
] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

// ═══════════════════════════════════════════════════════════════════════
//  Pricing constants
// ═══════════════════════════════════════════════════════════════════════

export const PRICING = {
  MONTHLY: 6.99,
  YEARLY: 69.99,
  YEARLY_MONTHLY_EQUIVALENT: 5.83,
  YEARLY_SAVINGS: 13.89,
  TRIAL_DAYS: 7,
  CURRENCY: "USD",
} as const;

// ═══════════════════════════════════════════════════════════════════════
//  PRO feature catalog (used by paywall UI)
// ═══════════════════════════════════════════════════════════════════════

export interface ProFeatureInfo {
  key: FlagKey;
  label: string;
  icon: string;
  description: string;
}

export const PRO_FEATURES_CATALOG: readonly ProFeatureInfo[] = [
  {
    key: "cloud_sync",
    label: "Cloud Sync",
    icon: "☁️",
    description: "Sync settings, favorites, and history across devices.",
  },
  {
    key: "auto_refresh",
    label: "Auto Refresh",
    icon: "🔄",
    description: "Auto-refresh playlists and EPG in the background.",
  },
  {
    key: "multi_epg_merge",
    label: "Multi-EPG Merge",
    icon: "📡",
    description: "Merge multiple EPG sources into one guide.",
  },
  {
    key: "pip_window",
    label: "Picture-in-Picture",
    icon: "🖼️",
    description: "Pop-out mini player that stays on top.",
  },
  {
    key: "discord_rpc",
    label: "Discord Presence",
    icon: "🎮",
    description: "Show what you're watching on Discord.",
  },
  {
    key: "smart_matching",
    label: "Smart Matching",
    icon: "🔗",
    description: "Fuzzy channel ↔ EPG auto-matching.",
  },
  {
    key: "unlimited_playlists",
    label: "Unlimited Playlists",
    icon: "📋",
    description: "Add as many playlists as you want.",
  },
] as const;

/** Maximum playlists for FREE tier. */
export const FREE_PLAYLIST_LIMIT = 1;

// ═══════════════════════════════════════════════════════════════════════
//  Request schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════

export const registerSchema = z.object({
  email: z.string().email("Invalid email").max(255).trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  displayName: z.string().trim().max(50, "Display name must be at most 50 characters").optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email").trim().toLowerCase(),
  password: z.string().min(1, "Password required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleAuthSchema = z.object({
  credential: z.string().min(1, "Google credential required"),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token required"),
});
export type LogoutInput = z.infer<typeof logoutSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email").trim().toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
  username?: string;
  displayName?: string;
  createdAt: string;
}

export interface SubscriptionDTO {
  plan: Plan;
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;
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
  auth: {
    hasGoogleSignIn: boolean;
    hasPasswordLogin: boolean;
  };
}

export interface FeaturesResponse {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  flags: Record<string, boolean>;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  isFoundingMember: boolean;
}

export type MasterSourceKind = "playlist" | "epg";
export type MasterSourceLoadMode = "url" | "api";

export interface MasterSourceDTO {
  id: string;
  kind: MasterSourceKind;
  name: string;
  url?: string;
  loadMode?: MasterSourceLoadMode;
  description?: string;
}

export interface MasterSourcesResponse {
  sources: MasterSourceDTO[];
}

export interface MasterSourceContentResponse {
  source: MasterSourceDTO;
  content: string;
  fetchedAt: string;
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
  emailConfigured: boolean;
  stripeKeyConfigured: boolean;
  billingEnabled: boolean;
  uptime: number;
  version: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

// ═══════════════════════════════════════════════════════════════════════
//  Profile system
// ═══════════════════════════════════════════════════════════════════════

// ── Username validation ───────────────────────────────────────────────

/** 3-24 chars, alphanumeric + underscores, must start with a letter. */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be at most 24 characters")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "Username must start with a letter and contain only letters, numbers, and underscores",
  );

/** Reserved usernames that cannot be claimed. */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "mod",
  "moderator",
  "support",
  "help",
  "system",
  "streamshogun",
  "shogun",
  "official",
  "api",
  "null",
  "undefined",
  "login",
  "register",
  "account",
  "settings",
  "profile",
  "community",
  "changelog",
  "terms",
  "privacy",
  "billing",
  "pro",
]);

// ── Profile schemas ───────────────────────────────────────────────────

export const setUsernameSchema = z.object({
  username: usernameSchema,
});
export type SetUsernameInput = z.infer<typeof setUsernameSchema>;

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(50, "Display name must be at most 50 characters")
    .optional()
    .or(z.literal("")),
  bio: z.string().max(2000, "Bio must be at most 2000 characters").optional(),
  location: z.string().max(100, "Location must be at most 100 characters").optional(),
  website: z.string().url("Must be a valid URL").max(200).optional().or(z.literal("")),
  avatarUrl: z.string().url("Must be a valid URL").max(500).optional().or(z.literal("")),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Profile response types ────────────────────────────────────────────

export interface AchievementDTO {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string | null; // ISO string if user has it, null if locked
}

export interface BadgeDTO {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  awardedAt: string;
}

export interface ProfileStatsDTO {
  playlists: number;
  channels: number;
  watchTimeMinutes: number;
  favoriteCount: number;
}

export interface PublicProfileDTO {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  plan: Plan;
  joinDate: string;
  badges: BadgeDTO[];
  stats: ProfileStatsDTO;
}

export interface ProfileAchievementsResponse {
  achievements: AchievementDTO[];
}

export interface MyProfileDTO extends PublicProfileDTO {
  email: string;
}
