// ── Licensing & Feature Flags ──────────────────────────────────────────
//
// Centralised feature-flag system for StreamShōgun.  Every gated
// capability maps to exactly one `Feature` enum member.  The
// `LicenseStatus` type represents the current activation state and
// is the single source of truth consumed by both main and renderer.

/** Premium features that require a Pro license. */
export enum Feature {
  /** Discord Rich Presence integration. */
  DiscordRpc = "discord_rpc",
  /** Multi-EPG source merge. */
  MultiEpgMerge = "multi_epg_merge",
  /** Smart fuzzy channel ↔ EPG matching. */
  SmartMatching = "smart_matching",
  /** Picture-in-Picture mini player window. */
  PipWindow = "pip_window",
  /** Automatic background playlist / EPG refresh. */
  AutoRefresh = "auto_refresh",
  /** Cloud settings / favorites sync. */
  CloudSync = "cloud_sync",
  /** Unlimited playlist sources (FREE tier has a cap). */
  UnlimitedPlaylists = "unlimited_playlists",
}

/** All gated features as a readonly array (for iteration). */
export const ALL_PRO_FEATURES: readonly Feature[] = Object.values(Feature) as Feature[];

/** Human-readable metadata for each feature (UI badges, tooltips). */
export const FEATURE_META: Readonly<Record<Feature, { label: string; icon: string; description: string }>> = {
  [Feature.DiscordRpc]: {
    label: "Discord RPC",
    icon: "🎮",
    description: "Show what you're watching as Discord Rich Presence status.",
  },
  [Feature.MultiEpgMerge]: {
    label: "Multi-EPG Merge",
    icon: "📡",
    description: "Combine multiple EPG sources into a unified programme guide.",
  },
  [Feature.SmartMatching]: {
    label: "Smart Matching",
    icon: "🔗",
    description: "Automatically match channels to EPG data using fuzzy name matching.",
  },
  [Feature.PipWindow]: {
    label: "Picture-in-Picture",
    icon: "🖼️",
    description: "Pop out a mini player window that stays on top.",
  },
  [Feature.AutoRefresh]: {
    label: "Auto Refresh",
    icon: "🔄",
    description: "Periodically refresh playlists and EPG sources in the background.",
  },
  [Feature.CloudSync]: {
    label: "Cloud Sync",
    icon: "☁️",
    description: "Sync settings, favorites and watch history across devices.",
  },
  [Feature.UnlimitedPlaylists]: {
    label: "Unlimited Playlists",
    icon: "📋",
    description: "Remove the free-tier limit on playlist sources.",
  },
};

/** Activation state of the license system. */
export interface LicenseStatus {
  /** Whether Pro features are currently enabled. */
  isProEnabled: boolean;
  /** The stored license key, or empty string if none. */
  licenseKey: string;
  /**
   * Validation state of the license key.
   *
   *  - `"none"`      → no key entered
   *  - `"valid"`     → key accepted (offline check passed)
   *  - `"invalid"`   → key rejected
   *  - `"unchecked"` → key present but not yet validated
   */
  validationState: LicenseValidationState;
}

export type LicenseValidationState = "none" | "valid" | "invalid" | "unchecked";

/** Default (free-tier) license status. */
export const DEFAULT_LICENSE_STATUS: LicenseStatus = {
  isProEnabled: false,
  licenseKey: "",
  validationState: "none",
};

/**
 * Check whether a specific feature is available given the current
 * license status.  Currently all gated features require
 * `isProEnabled === true` — per-feature gating can be added here
 * later without changing call sites.
 *
 * This is the **single checkpoint** — no scattered boolean logic.
 */
export function isFeatureEnabled(_feature: Feature, status: LicenseStatus): boolean {
  // Future: add per-feature override logic here
  return status.isProEnabled;
}

/**
 * Offline license-key format check.
 *
 * Accepts keys in the format `SS-XXXX-XXXX-XXXX-XXXX` where X is
 * an uppercase alphanumeric character.  This is a structural check
 * only — real validation will be added with online activation.
 */
export function validateLicenseKeyFormat(key: string): boolean {
  return /^SS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim());
}
