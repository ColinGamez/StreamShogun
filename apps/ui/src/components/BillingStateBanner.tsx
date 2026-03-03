// ── BillingStateBanner — PAST_DUE / CANCELED warning ──────────────────
//
// Renders edge-case billing banners:
//
//  • PAST_DUE  → "Payment issue — update your payment method"
//  • CANCELED  → "Pro access until {date}" (grace period)
//  • TRIALING  → "Trial ends {date}"
//
// Never blocks playback.  Dismissed by signing out or resolving.

import { useAppStore } from "../stores/app-store";
import * as bridge from "../lib/bridge";

export function BillingStateBanner() {
  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const currentPeriodEnd = useAppStore((s) => s.currentPeriodEnd);
  const trialEndsAt = useAppStore((s) => s.trialEndsAt);

  if (!authUser) return null;

  const periodEndStr = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString()
    : null;

  // ── PAST_DUE ─────────────────────────────────────────────────────
  if (subscriptionStatus === "PAST_DUE") {
    return (
      <div className="billing-banner billing-banner-warning" role="alert">
        <span className="billing-banner-icon">⚠️</span>
        <span className="billing-banner-text">
          Payment issue — please{" "}
          <button
            className="link-btn"
            onClick={() => bridge.billingPortal()}
          >
            update your payment method
          </button>
          {" "}to keep Pro features.
        </span>
      </div>
    );
  }

  // ── CANCELED with grace period ────────────────────────────────────
  if (
    subscriptionStatus === "CANCELED" &&
    authPlan === "PRO" &&
    periodEndStr
  ) {
    return (
      <div className="billing-banner billing-banner-info" role="status">
        <span className="billing-banner-icon">ℹ️</span>
        <span className="billing-banner-text">
          Your subscription was canceled. Pro access continues until{" "}
          <strong>{periodEndStr}</strong>.
        </span>
      </div>
    );
  }

  // ── TRIALING ───────────────────────────────────────────────────────
  if (subscriptionStatus === "TRIALING" && trialEndsAt) {
    const trialEndStr = new Date(trialEndsAt).toLocaleDateString();
    return (
      <div className="billing-banner billing-banner-trial" role="status">
        <span className="billing-banner-icon">🎁</span>
        <span className="billing-banner-text">
          Free trial — Pro features active until{" "}
          <strong>{trialEndStr}</strong>. Cancel anytime.
        </span>
      </div>
    );
  }

  return null;
}
