// ── useFeature — centralised Pro feature gate ─────────────────────────
//
// Returns whether a given feature is currently enabled and, if not,
// a callback to open the upgrade modal.  Consumed by every component
// that needs to gate a Pro capability.

import { useCallback } from "react";
import type { Feature } from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";

export interface UseFeatureResult {
  /** Whether the feature is currently available. */
  enabled: boolean;
  /** The current Pro-enabled state. */
  isPro: boolean;
  /** Call this to trigger the upgrade modal when the feature is gated. */
  requestUpgrade: () => void;
}

/**
 * Hook to check whether a Pro feature is available.
 *
 * Usage:
 * ```tsx
 * const { enabled, requestUpgrade } = useFeature(Feature.PipWindow);
 * if (!enabled) return <ProBadge onClick={requestUpgrade} />;
 * ```
 */
export function useFeature(feature: Feature): UseFeatureResult {
  const isEnabled = useAppStore((s) => s.isFeatureEnabled(feature));
  const isPro = useAppStore((s) => s.license.isProEnabled);

  const requestUpgrade = useCallback(() => {
    // Dispatch a custom DOM event that the UpgradeModal listens to.
    // This avoids prop-drilling or global state for modal visibility.
    window.dispatchEvent(
      new CustomEvent("shogun:request-upgrade", { detail: { feature } }),
    );
  }, [feature]);

  return { enabled: isEnabled, isPro, requestUpgrade };
}
