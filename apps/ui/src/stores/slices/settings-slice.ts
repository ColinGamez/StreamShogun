// ── Settings slice (locale + DB-backed settings) ─────────────────────
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import type { Locale } from "../../lib/i18n";
import { localStorageAdapter, loadJson, saveJson } from "../../lib/persistence";
import * as bridge from "../../lib/bridge";

const P = localStorageAdapter;

export interface SettingsSlice {
  locale: Locale;
  setLocale: (l: Locale) => void;

  settings: Record<string, string>;
  loadSettings: () => Promise<void>;
  setSetting: (key: string, value: string) => Promise<void>;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  locale: (loadJson<string>(P, "shogun:locale", "en") as Locale) || "en",

  setLocale: (l) => {
    saveJson(P, "shogun:locale", l);
    set({ locale: l });
  },

  settings: {},

  loadSettings: async () => {
    const res = await bridge.dbGetAllSettings();
    if (res.ok) {
      set({ settings: res.data });
      const savedLocale = res.data.locale;
      if (savedLocale && (savedLocale === "en" || savedLocale === "es" || savedLocale === "ja")) {
        set({ locale: savedLocale as Locale });
      }
    }
  },

  setSetting: async (key, value) => {
    await bridge.dbSetSetting(key, value);
    const current = get().settings;
    set({ settings: { ...current, [key]: value } });

    if (key === "locale" && (value === "en" || value === "es" || value === "ja")) {
      set({ locale: value as Locale });
      saveJson(P, "shogun:locale", value);
    }
  },
});
