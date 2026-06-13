// ── OfflineBanner — network-aware offline indicator ────────────────────
//
// Shown at the top of the app when either:
//   1. The entitlement cache is being used (usingCachedPlan), OR
//   2. The browser reports navigator.onLine === false.
// Disappears once connectivity is restored. Never blocks playback.

import { useAppStore } from "../stores/app-store";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

export function OfflineBanner() {
  const usingCachedPlan = useAppStore((s) => s.usingCachedPlan);
  const serverFlagsTimestamp = useAppStore((s) => s.serverFlagsTimestamp);
  const online = useNetworkStatus();

  if (!usingCachedPlan && online) return null;

  const lastSync = serverFlagsTimestamp
    ? new Date(serverFlagsTimestamp).toLocaleString()
    : "unknown";

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-banner-icon">⚡</span>
      <span className="offline-banner-text">
        {!online
          ? "No internet connection — some features may be unavailable"
          : `Offline – using cached plan (last sync: ${lastSync})`}
      </span>
    </div>
  );
}
