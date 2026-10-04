import { describe, expect, it } from "vitest";
import {
  DEFAULT_LICENSE_STATUS,
  isFeatureEnabled,
  isProActive,
  validateLicenseKeyFormat,
  Feature,
} from "../licensing.js";

const VALID_KEY = "SS-AB12-CD34-EF56-GH78";

describe("isProActive", () => {
  it("is false for the default free-tier status", () => {
    expect(isProActive(DEFAULT_LICENSE_STATUS)).toBe(false);
  });

  it("is true only when the flag, state, and key format all agree", () => {
    expect(
      isProActive({ isProEnabled: true, licenseKey: VALID_KEY, validationState: "valid" }),
    ).toBe(true);
  });

  it("rejects a set flag with a non-valid state (stale/dev toggles)", () => {
    expect(
      isProActive({ isProEnabled: true, licenseKey: VALID_KEY, validationState: "unchecked" }),
    ).toBe(false);
    expect(isProActive({ isProEnabled: true, licenseKey: "", validationState: "none" })).toBe(
      false,
    );
  });

  it("rejects a valid state with a malformed key", () => {
    expect(
      isProActive({ isProEnabled: true, licenseKey: "not-a-key", validationState: "valid" }),
    ).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("follows isProActive for every feature", () => {
    const active = { isProEnabled: true, licenseKey: VALID_KEY, validationState: "valid" as const };
    const inactive = { ...active, validationState: "none" as const, isProEnabled: true };
    expect(isFeatureEnabled(Feature.PipWindow, active)).toBe(true);
    expect(isFeatureEnabled(Feature.PipWindow, inactive)).toBe(false);
    expect(isFeatureEnabled(Feature.CloudSync, DEFAULT_LICENSE_STATUS)).toBe(false);
  });

  it("validates the documented key format", () => {
    expect(validateLicenseKeyFormat(VALID_KEY)).toBe(true);
    expect(validateLicenseKeyFormat("SS-abc-123")).toBe(false);
  });
});
