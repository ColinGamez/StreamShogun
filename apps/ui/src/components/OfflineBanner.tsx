// ── OfflineBanner — "Offline – using cached plan" indicator ───────────
//
// Shown at the top of the app when the entitlement cache is being used
// because the server is unreachable.  Disappears once connectivity
// is restored and a fresh fetch succeeds.  Never blocks playback.

import { useAppStore } from "../stores/app-store";

export function OfflineBanner() {
  const usingCachedPlan = useAppStore((s) => s.usingCachedPlan);
  const serverFlagsTimestamp = useAppStore((s) => s.serverFlagsTimestamp);

  if (!usingCachedPlan) return null;

  const lastSync = serverFlagsTimestamp
    ? new Date(serverFlagsTimestamp).toLocaleString()
    : "unknown";

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span className="offline-banner-icon">⚡</span>
      <span className="offline-banner-text">
        Offline – using cached plan (last sync: {lastSync})
      </span>
    </div>
  );
}
