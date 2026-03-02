// ── License slice (local offline license key management) ─────────────
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import type { Feature, LicenseStatus } from "@stream-shogun/core";
import { isFeatureEnabled, DEFAULT_LICENSE_STATUS } from "@stream-shogun/core";
import * as bridge from "../../lib/bridge";

export interface LicenseSlice {
  license: LicenseStatus;
  loadLicense: () => Promise<void>;
  activateLicenseKey: (key: string) => Promise<LicenseStatus | null>;
  setProEnabled: (enabled: boolean) => Promise<LicenseStatus | null>;
  isFeatureEnabled: (feature: Feature) => boolean;
}

export const createLicenseSlice: StateCreator<AppState, [], [], LicenseSlice> = (set, get) => ({
  license: DEFAULT_LICENSE_STATUS,

  loadLicense: async () => {
    const res = await bridge.licenseGetStatus();
    if (res.ok) set({ license: res.data });
  },

  activateLicenseKey: async (key) => {
    const res = await bridge.licenseSetKey(key);
    if (res.ok) {
      set({ license: res.data });
      return res.data;
    }
    return null;
  },

  setProEnabled: async (enabled) => {
    const res = await bridge.licenseSetProEnabled(enabled);
    if (res.ok) {
      set({ license: res.data });
      return res.data;
    }
    return null;
  },

  isFeatureEnabled: (feature: Feature) => {
    return isFeatureEnabled(feature, get().license);
  },
});
