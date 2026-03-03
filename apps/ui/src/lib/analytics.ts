// ── Lightweight analytics hooks ───────────────────────────────────────
//
// Thin abstraction over analytics events.  Currently logs to console
// and dispatches CustomEvents so any analytics provider (Amplitude,
// PostHog, etc.) can be wired in later without touching call sites.

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: number;
}

function emit(name: string, props?: Record<string, unknown>): void {
  const payload: AnalyticsEvent = {
    event: name,
    properties: props,
    timestamp: Date.now(),
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[analytics]", payload);
  }

  window.dispatchEvent(
    new CustomEvent("shogun:analytics", { detail: payload }),
  );
}

/** User clicked on a PRO feature / tried a gated action. */
export function logUpgradeIntent(feature: string): void {
  emit("upgrade_intent", { feature });
}

/** User clicked "Upgrade" and we opened Stripe Checkout. */
export function logCheckoutStarted(interval: "monthly" | "yearly"): void {
  emit("checkout_started", { interval });
}

/** Checkout completed — plan refreshed to PRO. */
export function logCheckoutCompleted(interval: string | null): void {
  emit("checkout_completed", { interval });
}

/** User opened the paywall modal. */
export function logPaywallViewed(feature: string | null): void {
  emit("paywall_viewed", { feature });
}

/** Nudge banner was displayed. */
export function logNudgeShown(reason: string): void {
  emit("nudge_shown", { reason });
}
