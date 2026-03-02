// ── UpgradeNudgeBanner — soft conversion prompt ───────────────────────
//
// Shown when a FREE user has opened the app > 5 times.
// Dismissible per session.  Never blocks playback.

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../stores/app-store";
import { logNudgeShown } from "../lib/analytics";
import { YEARLY_SAVINGS_LABEL } from "../lib/pricing";

export function UpgradeNudgeBanner() {
  const [dismissed, setDismissed] = useState(false);
  const loggedRef = useRef(false);

  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const appOpenCount = useAppStore((s) => s.appOpenCount);
  const license = useAppStore((s) => s.license);

  // Only show for logged-in FREE users who have opened the app > 5 times
  const isPro = authPlan === "PRO" || license.isProEnabled;
  const shouldShow = !isPro && !dismissed && !!authUser && appOpenCount > 5;

  // Fire analytics once when banner becomes visible (in useEffect, not render)
  useEffect(() => {
    if (shouldShow && !loggedRef.current) {
      loggedRef.current = true;
      logNudgeShown("open_count_threshold");
    }
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <div className="nudge-banner" role="complementary">
      <span className="nudge-banner-text">
        🚀 Unlock <strong>PIP</strong>, <strong>Cloud Sync</strong> &amp; more
        — {YEARLY_SAVINGS_LABEL} with annual billing.
      </span>
      <button
        className="btn-primary btn-sm"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("shogun:show-paywall", { detail: {} }),
          )
        }
      >
        Upgrade
      </button>
      <button
        className="nudge-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
