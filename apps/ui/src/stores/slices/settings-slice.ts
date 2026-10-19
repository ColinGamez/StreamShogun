// ── Settings slice (locale + DB-backed settings) ─────────────────────
import type { StateCreator } from "zustand";
import type { AppState } from "../app-store";
import { SUPPORTED_LOCALES, type Locale } from "../../lib/i18n";
import { localStorageAdapter, loadJson, saveJson } from "../../lib/persistence";
import * as bridge from "../../lib/bridge";

const P = localStorageAdapter;

/** Accept only locales the UI actually ships (guards against stale DB values). */
function isSupportedLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.some((l) => l.code === value);
}

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
      if (savedLocale && isSupportedLocale(savedLocale)) {
        set({ locale: savedLocale });
      }
    }
  },

  setSetting: async (key, value) => {
    await bridge.dbSetSetting(key, value);
    const current = get().settings;
    set({ settings: { ...current, [key]: value } });

    if (key === "locale" && isSupportedLocale(value)) {
      set({ locale: value });
      saveJson(P, "shogun:locale", value);
    }
  },
});
