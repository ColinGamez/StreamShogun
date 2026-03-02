// ── useCanUse — unified entitlement gate hook ────────────────────────
//
// Central checkpoint for gating premium features.  Combines:
//   1. Local offline license key (`LicenseStatus.isProEnabled`)
//   2. Server-side subscription flags (with 7-day offline cache)
//
// Usage:
// ```tsx
// const allowed = useCanUse("discord_rpc");
// if (!allowed) return <ProBadge onClick={requestUpgrade} />;
// ```
//
// Core playback is **never** gated — only premium add-ons use this.

import { useAppStore } from "../stores/app-store";

/**
 * Returns `true` when the current user is entitled to use the
 * given feature — either via a local license key activation or a
 * server-side subscription that is still within the 7-day offline
 * grace window.
 */
export function useCanUse(flagKey: string): boolean {
  return useAppStore((s) => s.canUse(flagKey));
}
