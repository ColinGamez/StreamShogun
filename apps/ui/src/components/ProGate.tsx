// ── ProGate — declarative feature gate wrapper ────────────────────────
//
// Renders children normally when the feature is available (PRO active
// or local license key).  When locked, shows a muted overlay with a
// lock icon + click-to-upgrade affordance.  Never hides UI entirely.

import type { ReactNode } from "react";
import { useAppStore } from "../stores/app-store";

interface ProGateProps {
  /** The flag key to check, e.g. "cloud_sync". */
  feature: string;
  /** Content to render (always visible, but dimmed when locked). */
  children: ReactNode;
  /**
   * Optional label shown in the lock overlay.
   * Defaults to "Pro Feature".
   */
  label?: string;
}

export function ProGate({ feature, children, label }: ProGateProps) {
  const canUse = useAppStore((s) => s.canUse(feature));
  const requestFeature = useAppStore((s) => s.requestFeature);

  if (canUse) {
    return <>{children}</>;
  }

  return (
    <div className="pro-gate-wrapper">
      <div className="pro-gate-content" aria-hidden="true">
        {children}
      </div>
      <button
        className="pro-gate-overlay"
        onClick={() => requestFeature(feature)}
        aria-label={`Unlock ${label ?? "Pro Feature"}`}
      >
        <span className="pro-gate-lock">🔒</span>
        <span className="pro-gate-label">{label ?? "Pro Feature"}</span>
        <span className="pro-gate-cta">Click to upgrade</span>
      </button>
    </div>
  );
}
