// ── Application store (Zustand) — composed from domain slices ─────────
//
// Each slice lives in ./slices/<name>-slice.ts for maintainability.
// The unified `useAppStore` hook is the sole public API — no consumer
// changes are needed.

import { create } from "zustand";
import type { SettingsSlice } from "./slices/settings-slice";
import type { LibrarySlice } from "./slices/library-slice";
import type { PlayerSlice } from "./slices/player-slice";
import type { LicenseSlice } from "./slices/license-slice";
import type { AuthSlice } from "./slices/auth-slice";
import type { CloudSyncSlice } from "./slices/cloud-sync-slice";
import {
  createSettingsSlice,
  createLibrarySlice,
  createPlayerSlice,
  createLicenseSlice,
  createAuthSlice,
  createCloudSyncSlice,
} from "./slices";

// ── Persisted source metadata (re-exported for consumers) ─────────────
export interface PlaylistEntry {
  id: string;
  name: string;
  location: string;
  type: "url" | "file";
  channelCount: number;
  addedAt: number;
}

export interface EpgEntry {
  id: string;
  name: string;
  location: string;
  type: "url" | "file";
  programmeCount: number;
  channelCount: number;
  addedAt: number;
}

// ── Unified store type ────────────────────────────────────────────────
export type AppState =
  SettingsSlice &
  LibrarySlice &
  PlayerSlice &
  LicenseSlice &
  AuthSlice &
  CloudSyncSlice;

// ── Store ─────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>((...a) => ({
  ...createSettingsSlice(...a),
  ...createLibrarySlice(...a),
  ...createPlayerSlice(...a),
  ...createLicenseSlice(...a),
  ...createAuthSlice(...a),
  ...createCloudSyncSlice(...a),
}));
