// ── UpgradeNudgeBanner — soft conversion prompt ───────────────────────
//
// Shown when a FREE user has opened the app > 5 times.
// Dismissible per session.  Never blocks playback.

import { useState } from "react";
import { useAppStore } from "../stores/app-store";
import { logNudgeShown } from "../lib/analytics";
import { YEARLY_SAVINGS_LABEL } from "../lib/pricing";

export function UpgradeNudgeBanner() {
  const [dismissed, setDismissed] = useState(false);

  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const appOpenCount = useAppStore((s) => s.appOpenCount);
  const license = useAppStore((s) => s.license);

  // Only show for logged-in FREE users who have opened the app > 5 times
  const isPro = authPlan === "PRO" || license.isProEnabled;
  if (isPro || dismissed || !authUser || appOpenCount <= 5) return null;

  // Fire analytics once via module-level guard
  logNudgeShown("open_count_threshold");

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
