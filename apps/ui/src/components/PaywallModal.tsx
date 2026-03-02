// ── PaywallModal — SaaS upgrade paywall with pricing ──────────────────
//
// Triggered by the `shogun:show-paywall` CustomEvent.  Shows PRO
// features, monthly/yearly pricing with savings, optional trial
// messaging, and checkout CTAs.  Falls through to license-key
// activation if user already has a key.

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import type { Feature } from "@stream-shogun/core";
import {
  type LicenseStatus,
} from "@stream-shogun/core";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { PRO_FEATURES_CATALOG } from "@stream-shogun/shared";
import { useAppStore } from "../stores/app-store";
import * as bridge from "../lib/bridge";
import { showToast } from "./Toast";
import {
  MONTHLY_LABEL,
  YEARLY_LABEL,
  YEARLY_PER_MONTH_LABEL,
  YEARLY_SAVINGS_LABEL,
  TRIAL_LABEL,
} from "../lib/pricing";
import { logCheckoutStarted, logPaywallViewed } from "../lib/analytics";

type PaywallTab = "saas" | "license";

export function PaywallModal() {
  const [open, setOpen] = useState(false);
  const [highlightFeature, setHighlightFeature] = useState<string | null>(null);
  const [tab, setTab] = useState<PaywallTab>("saas");
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);

  // License key state
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [keyError, setKeyError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const isFoundingMember = useAppStore((s) => s.isFoundingMember);
  const fetchServerFeatures = useAppStore((s) => s.fetchServerFeatures);
  const license = useAppStore((s) => s.license);
  const activateLicenseKey = useAppStore((s) => s.activateLicenseKey);
  const isPro = authPlan === "PRO" || license.isProEnabled;

  // ── Listen for both paywall and legacy upgrade events ───────────────
  useEffect(() => {
    const handlePaywall = (e: Event) => {
      const detail = (e as CustomEvent<{ feature?: string }>).detail;
      setHighlightFeature(detail?.feature ?? null);
      setKeyError("");
      setTab("saas");
      setOpen(true);
      logPaywallViewed(detail?.feature ?? null);
    };
    const handleUpgrade = (e: Event) => {
      const detail = (e as CustomEvent<{ feature?: Feature }>).detail;
      setHighlightFeature(detail?.feature ?? null);
      setKeyError("");
      setTab(authUser ? "saas" : "license");
      setOpen(true);
      logPaywallViewed(detail?.feature ?? null);
    };
    window.addEventListener("shogun:show-paywall", handlePaywall);
    window.addEventListener("shogun:request-upgrade", handleUpgrade);
    return () => {
      window.removeEventListener("shogun:show-paywall", handlePaywall);
      window.removeEventListener("shogun:request-upgrade", handleUpgrade);
    };
  }, [authUser]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setKeyError("");
    setKeyInput("");
    setLoading(null);
  }, []);

  const handleCheckout = useCallback(
    async (interval: "monthly" | "yearly") => {
      if (!authUser) {
        window.dispatchEvent(new CustomEvent("shogun:show-login"));
        return;
      }
      setLoading(interval);
      logCheckoutStarted(interval);
      const res = await bridge.billingCheckout(interval);
      setLoading(null);
      if (!res.ok) {
        showToast("Failed to open checkout", "error");
      }
    },
    [authUser],
  );

  const handleActivateKey = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!keyInput.trim()) return;
      setActivating(true);
      setKeyError("");
      const result: LicenseStatus | null = await activateLicenseKey(
        keyInput.trim().toUpperCase(),
      );
      setActivating(false);
      if (result && result.validationState === "valid") {
        setTimeout(handleClose, 600);
      } else {
        setKeyError("Invalid license key. Format: SS-XXXX-XXXX-XXXX-XXXX");
      }
    },
    [keyInput, activateLicenseKey, handleClose],
  );

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        ref={dialogRef}
        className="modal paywall-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Pro"
      >
        {/* Header */}
        <div className="paywall-header">
          <h2>⭐ Upgrade to Pro</h2>
          {isFoundingMember && (
            <span className="founding-badge">🏅 Founding Member</span>
          )}
          <button
            className="modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Already PRO */}
        {isPro && (
          <div className="paywall-activated">
            <span className="paywall-activated-icon">✅</span>
            <p>
              Pro features are <strong>active</strong>. Thank you!
            </p>
          </div>
        )}

        {!isPro && (
          <>
            {/* Feature list */}
            <div className="paywall-features">
              {PRO_FEATURES_CATALOG.map((f) => {
                const isHighlighted = f.key === highlightFeature;
                return (
                  <div
                    key={f.key}
                    className={`paywall-feature-row${isHighlighted ? " highlighted" : ""}`}
                  >
                    <span className="paywall-feature-icon">{f.icon}</span>
                    <div className="paywall-feature-text">
                      <span className="paywall-feature-label">{f.label}</span>
                      <span className="paywall-feature-desc">
                        {f.description}
                      </span>
                    </div>
                    <span className="paywall-feature-lock">🔒</span>
                  </div>
                );
              })}
            </div>

            {/* Tab switcher */}
            <div className="paywall-tabs">
              <button
                className={`paywall-tab${tab === "saas" ? " active" : ""}`}
                onClick={() => setTab("saas")}
              >
                Subscribe
              </button>
              <button
                className={`paywall-tab${tab === "license" ? " active" : ""}`}
                onClick={() => setTab("license")}
              >
                License Key
              </button>
            </div>

            {/* SaaS checkout */}
            {tab === "saas" && (
              <div className="paywall-pricing">
                <p className="paywall-trial-note">{TRIAL_LABEL}</p>

                <div className="paywall-price-cards">
                  <button
                    className="price-card"
                    disabled={loading !== null}
                    onClick={() => handleCheckout("monthly")}
                  >
                    <span className="price-card-title">Monthly</span>
                    <span className="price-card-amount">{MONTHLY_LABEL}</span>
                    {loading === "monthly" && (
                      <span className="price-card-loading">Opening…</span>
                    )}
                  </button>

                  <button
                    className="price-card price-card-best"
                    disabled={loading !== null}
                    onClick={() => handleCheckout("yearly")}
                  >
                    <span className="price-card-badge">Best Value</span>
                    <span className="price-card-title">Yearly</span>
                    <span className="price-card-amount">{YEARLY_LABEL}</span>
                    <span className="price-card-equiv">
                      {YEARLY_PER_MONTH_LABEL}
                    </span>
                    <span className="price-card-savings">
                      {YEARLY_SAVINGS_LABEL}
                    </span>
                    {loading === "yearly" && (
                      <span className="price-card-loading">Opening…</span>
                    )}
                  </button>
                </div>

                {!authUser && (
                  <p className="paywall-signin-note">
                    <button
                      className="link-btn"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent("shogun:show-login"),
                        );
                      }}
                    >
                      Sign in
                    </button>{" "}
                    to subscribe
                  </p>
                )}

                {authUser && (
                  <button
                    className="btn-secondary paywall-refresh"
                    onClick={async () => {
                      await fetchServerFeatures();
                      showToast("Plan status refreshed", "success");
                    }}
                  >
                    🔄 Already upgraded? Refresh status
                  </button>
                )}
              </div>
            )}

            {/* License key activation */}
            {tab === "license" && (
              <div className="paywall-license">
                <form className="paywall-license-form" onSubmit={handleActivateKey}>
                  <label htmlFor="paywall-key-input">License Key</label>
                  <div className="paywall-input-row">
                    <input
                      ref={inputRef}
                      id="paywall-key-input"
                      type="text"
                      placeholder="SS-XXXX-XXXX-XXXX-XXXX"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      className={keyError ? "input-error" : ""}
                    />
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={activating || !keyInput.trim()}
                    >
                      {activating ? "Activating…" : "Activate"}
                    </button>
                  </div>
                  {keyError && <p className="paywall-error">{keyError}</p>}
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
