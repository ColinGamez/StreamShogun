// ── Shared types for StreamShōgun ──

/** Represents a stream event from any platform. */
export interface StreamEvent {
  id: string;
  platform: Platform;
  type: EventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

export type Platform = "twitch" | "youtube" | "kick" | "custom";

export type EventType = "chat_message" | "subscription" | "donation" | "follow" | "raid" | "custom";

/** Application configuration stored on disk. */
export interface AppConfig {
  version: string;
  theme: "light" | "dark" | "system";
  locale: string;
  connections: ConnectionConfig[];
}

export interface ConnectionConfig {
  platform: Platform;
  enabled: boolean;
  credentials: Record<string, string>;
}

/** IPC channel names shared between main & renderer. */
export const IpcChannels = {
  GET_APP_INFO: "app:get-info",
  GET_CONFIG: "config:get",
  SET_CONFIG: "config:set",
  STREAM_EVENT: "stream:event",
  PING: "app:ping",
  PLAYLIST_LOAD_FILE: "playlist:load-file",
  PLAYLIST_LOAD_URL: "playlist:load-url",
  EPG_LOAD_FILE: "epg:load-file",
  EPG_LOAD_URL: "epg:load-url",

  // ── DB-backed persistence ───────────────────────────────────────
  DB_SAVE_PLAYLIST: "db:save-playlist",
  DB_LIST_PLAYLISTS: "db:list-playlists",
  DB_REMOVE_PLAYLIST: "db:remove-playlist",
  DB_LIST_CHANNELS: "db:list-channels",
  DB_SET_FAVORITE: "db:set-favorite",
  DB_LIST_FAVORITES: "db:list-favorites",
  DB_SAVE_EPG_SOURCE: "db:save-epg-source",
  DB_LIST_EPG_SOURCES: "db:list-epg-sources",
  DB_REMOVE_EPG_SOURCE: "db:remove-epg-source",
  DB_GET_NOW_NEXT: "db:get-now-next",
  DB_GET_EPG_RANGE: "db:get-epg-range",

  // ── Settings (F8) ──────────────────────────────────────────────
  DB_GET_ALL_SETTINGS: "db:get-all-settings",
  DB_SET_SETTING: "db:set-setting",

  // ── Watch history (F4) ─────────────────────────────────────────
  DB_SAVE_WATCH: "db:save-watch",
  DB_LIST_WATCH_HISTORY: "db:list-watch-history",
  DB_GET_LAST_WATCHED: "db:get-last-watched",
  DB_CLEAR_WATCH_HISTORY: "db:clear-watch-history",

  // ── Auto refresh (F1) ─────────────────────────────────────────
  REFRESH_SET_INTERVAL: "refresh:set-interval",
  REFRESH_TRIGGER: "refresh:trigger",
  REFRESH_GET_STATUS: "refresh:get-status",
  /** Main → renderer push event when a source has been refreshed. */
  REFRESH_COMPLETED: "refresh:completed",

  // ── Mini player / PIP (F5) ────────────────────────────────────
  PIP_OPEN: "pip:open",
  PIP_CLOSE: "pip:close",
  PIP_IS_OPEN: "pip:is-open",

  // ── Discord Rich Presence (F6) ────────────────────────────────
  DISCORD_SET_ACTIVITY: "discord:set-activity",
  DISCORD_CLEAR_ACTIVITY: "discord:clear-activity",
  // ── License / Pro (Monetization) ──────────────────────────────────
  LICENSE_GET_STATUS: "license:get-status",
  LICENSE_SET_KEY: "license:set-key",
  LICENSE_SET_PRO_ENABLED: "license:set-pro-enabled",

  // ── Auth / SaaS ────────────────────────────────────────────────
  AUTH_REGISTER: "auth:register",
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_REFRESH: "auth:refresh",
  FEATURES_FETCH: "features:fetch",

  // ── Billing ────────────────────────────────────────────────────
  BILLING_CHECKOUT: "billing:checkout",
  BILLING_PORTAL: "billing:portal",

  // ── Cloud Sync (v1) ──────────────────────────────────────────
  CLOUD_SYNC_PULL: "cloud:sync-pull",
  CLOUD_SYNC_PUSH: "cloud:sync-push",
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
