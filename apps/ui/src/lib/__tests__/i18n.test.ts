import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, t, translations, type Locale } from "../i18n";

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("i18n locale parity", () => {
  it("every supported locale defines exactly the English key set", () => {
    const enKeys = Object.keys(translations.en).sort();
    for (const { code } of SUPPORTED_LOCALES) {
      expect(Object.keys(translations[code]).sort(), `locale "${code}" key set`).toEqual(enKeys);
    }
  });

  it("every locale keeps the same {placeholders} as English", () => {
    for (const [key, enValue] of Object.entries(translations.en)) {
      for (const { code } of SUPPORTED_LOCALES) {
        expect(placeholders(translations[code][key]), `"${key}" in "${code}"`).toEqual(
          placeholders(enValue),
        );
      }
    }
  });

  it("every SUPPORTED_LOCALES entry has a dictionary", () => {
    for (const { code, label } of SUPPORTED_LOCALES) {
      expect(translations[code], code).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("t()", () => {
  it("translates in each locale and interpolates parameters", () => {
    expect(t("nav.library", "en")).toBe("Library");
    expect(t("nav.library", "ko")).toBe("라이브러리");
    expect(t("history.timeAgo.minutesAgo", "ko", { n: 5 })).toBe("5분 전");
  });

  it("falls back to English for an unknown locale, then to the raw key", () => {
    const key = Object.keys(translations.en)[0];
    expect(t(key, "xx" as Locale)).toBe(translations.en[key]);
    expect(t("no.such.key", "en")).toBe("no.such.key");
  });
});
