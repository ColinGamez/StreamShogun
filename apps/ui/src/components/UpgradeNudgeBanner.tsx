// ── UpgradeNudgeBanner — soft conversion prompt ───────────────────────
//
// Shown when a FREE user has opened the app > 5 times.
// Dismissible for 7 days (persisted to localStorage).  Never blocks playback.

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../stores/app-store";
import { logNudgeShown } from "../lib/analytics";
import { YEARLY_SAVINGS_LABEL } from "../lib/pricing";

const DISMISS_KEY = "nudge_dismissed_until";
const DISMISS_DAYS = 7;

function isDismissedPersisted(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() < Number(raw);
  } catch {
    return false;
  }
}

function persistDismiss(): void {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    /* storage full / blocked — ignore */
  }
}

export function UpgradeNudgeBanner() {
  const [dismissed, setDismissed] = useState(isDismissedPersisted);
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

  const handleDismiss = useCallback(() => {
    persistDismiss();
    setDismissed(true);
  }, []);

  if (!shouldShow) return null;

  return (
    <div className="nudge-banner" role="status">
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
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
