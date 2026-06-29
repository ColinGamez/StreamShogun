// ── PaywallModal — SaaS upgrade paywall with pricing ──────────────────
//
// Triggered by the `shogun:show-paywall` CustomEvent.  Shows PRO
// features, monthly/yearly pricing with savings, optional trial
// messaging, and checkout CTAs.  Falls through to license-key
// activation if user already has a key.

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import type { Feature } from "@stream-shogun/core";
import { type LicenseStatus } from "@stream-shogun/core";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { PRO_FEATURES_CATALOG } from "@stream-shogun/shared";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
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
  const [loading, setLoading] = useState<"monthly" | "yearly" | "refresh" | null>(null);

  // License key state
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [keyError, setKeyError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const locale = useAppStore((s) => s.locale);
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
        showToast(t("paywall.checkoutFailed", locale), "error");
      }
    },
    [authUser, locale],
  );

  const handleBillingRefresh = useCallback(async () => {
    setLoading("refresh");
    const reconcile = await bridge.billingReconcile();
    await fetchServerFeatures();
    setLoading(null);
    showToast(
      reconcile.ok ? t("paywall.refreshed", locale) : t("paywall.checkoutFailed", locale),
      reconcile.ok ? "success" : "error",
    );
  }, [fetchServerFeatures, locale]);

  const handleActivateKey = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!keyInput.trim()) return;
      setActivating(true);
      setKeyError("");
      const result: LicenseStatus | null = await activateLicenseKey(keyInput.trim().toUpperCase());
      setActivating(false);
      if (result && result.validationState === "valid") {
        setTimeout(handleClose, 600);
      } else {
        setKeyError(t("paywall.invalidKey", locale));
      }
    },
    [keyInput, activateLicenseKey, handleClose, locale],
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
        aria-label={t("paywall.title", locale)}
      >
        {/* Header */}
        <div className="paywall-header">
          <h2>⭐ {t("paywall.title", locale)}</h2>
          {isFoundingMember && (
            <span className="founding-badge">🏅 {t("paywall.foundingMember", locale)}</span>
          )}
          <button
            className="modal-close"
            onClick={handleClose}
            aria-label={t("toast.dismiss", locale)}
          >
            ✕
          </button>
        </div>

        {/* Already PRO */}
        {isPro && (
          <div className="paywall-activated">
            <span className="paywall-activated-icon">✅</span>
            <p>{t("paywall.activated", locale)}</p>
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
                      <span className="paywall-feature-desc">{f.description}</span>
                    </div>
                    <span className="paywall-feature-lock">🔒</span>
                  </div>
                );
              })}
            </div>

            {/* Tab switcher */}
            <div className="paywall-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "saas"}
                className={`paywall-tab${tab === "saas" ? " active" : ""}`}
                onClick={() => setTab("saas")}
              >
                {t("paywall.subscribe", locale)}
              </button>
              <button
                role="tab"
                aria-selected={tab === "license"}
                className={`paywall-tab${tab === "license" ? " active" : ""}`}
                onClick={() => setTab("license")}
              >
                {t("paywall.licenseKey", locale)}
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
                    <span className="price-card-title">{t("paywall.monthly", locale)}</span>
                    <span className="price-card-amount">{MONTHLY_LABEL}</span>
                    {loading === "monthly" && (
                      <span className="price-card-loading">{t("paywall.opening", locale)}</span>
                    )}
                  </button>

                  <button
                    className="price-card price-card-best"
                    disabled={loading !== null}
                    onClick={() => handleCheckout("yearly")}
                  >
                    <span className="price-card-badge">{t("paywall.bestValue", locale)}</span>
                    <span className="price-card-title">{t("paywall.yearly", locale)}</span>
                    <span className="price-card-amount">{YEARLY_LABEL}</span>
                    <span className="price-card-equiv">{YEARLY_PER_MONTH_LABEL}</span>
                    <span className="price-card-savings">{YEARLY_SAVINGS_LABEL}</span>
                    {loading === "yearly" && (
                      <span className="price-card-loading">{t("paywall.opening", locale)}</span>
                    )}
                  </button>
                </div>

                {!authUser && (
                  <p className="paywall-signin-note">
                    <button
                      className="link-btn"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent("shogun:show-login"));
                      }}
                    >
                      {t("paywall.signIn", locale)}
                    </button>{" "}
                    {t("paywall.toSubscribe", locale)}
                  </p>
                )}

                {authUser && (
                  <button
                    className="btn-secondary paywall-refresh"
                    disabled={loading !== null}
                    onClick={handleBillingRefresh}
                  >
                    🔄{" "}
                    {loading === "refresh"
                      ? t("paywall.opening", locale)
                      : t("paywall.refreshLabel", locale)}
                  </button>
                )}
              </div>
            )}

            {/* License key activation */}
            {tab === "license" && (
              <div className="paywall-license">
                <form className="paywall-license-form" onSubmit={handleActivateKey}>
                  <label htmlFor="paywall-key-input">{t("paywall.licenseKey", locale)}</label>
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
                      {activating ? t("paywall.activating", locale) : t("paywall.activate", locale)}
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
