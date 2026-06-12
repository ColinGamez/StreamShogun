import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../stores/app-store";
import { t } from "../lib/i18n";
import * as bridge from "../lib/bridge";
import { showToast } from "../components/Toast";
import { logCheckoutStarted } from "../lib/analytics";
import {
  MONTHLY_LABEL,
  YEARLY_LABEL,
  YEARLY_PER_MONTH_LABEL,
  YEARLY_SAVINGS_LABEL,
} from "../lib/pricing";

interface RefreshStatus {
  enabled: boolean;
  intervalMin: number;
  lastRefreshAt: number;
  refreshing: boolean;
  playlistCount: number;
  epgSourceCount: number;
}

export function SettingsPage() {
  const locale = useAppStore((s) => s.locale);
  const settings = useAppStore((s) => s.settings);
  const setSetting = useAppStore((s) => s.setSetting);

  // ── Account state ───────────────────────────────────────────────────
  const authUser = useAppStore((s) => s.authUser);
  const authPlan = useAppStore((s) => s.authPlan);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const billingInterval = useAppStore((s) => s.billingInterval);
  const serverFlagsTimestamp = useAppStore((s) => s.serverFlagsTimestamp);
  const isOffline = useAppStore((s) => s.isOffline);
  const usingCachedPlan = useAppStore((s) => s.usingCachedPlan);
  const authLogoutAction = useAppStore((s) => s.authLogoutAction);
  const fetchServerFeatures = useAppStore((s) => s.fetchServerFeatures);
  const currentPeriodEnd = useAppStore((s) => s.currentPeriodEnd);
  const trialEndsAt = useAppStore((s) => s.trialEndsAt);
  const isFoundingMember = useAppStore((s) => s.isFoundingMember);
  // ── Billing state ──────────────────────────────────────────────────
  const [billingLoading, setBillingLoading] = useState<"monthly" | "yearly" | "portal" | null>(
    null,
  );
  // ── Cloud Sync state ───────────────────────────────────────────────────────
  const canUseCloudSync = useAppStore((s) => s.canUse("cloud_sync"));
  const cloudSyncEnabled = useAppStore((s) => s.cloudSyncEnabled);
  const cloudSyncLastAt = useAppStore((s) => s.cloudSyncLastAt);
  const cloudSyncing = useAppStore((s) => s.cloudSyncing);
  const setCloudSyncEnabled = useAppStore((s) => s.setCloudSyncEnabled);
  const cloudPush = useAppStore((s) => s.cloudPush);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null);

  // ── Fetch refresh status ────────────────────────────────────────────
  const loadRefreshStatus = useCallback(async () => {
    const res = await bridge.refreshGetStatus();
    if (res.ok) setRefreshStatus(res.data as RefreshStatus);
  }, []);

  useEffect(() => {
    loadRefreshStatus();
  }, [loadRefreshStatus]);

  // ── Toggle helpers ──────────────────────────────────────────────────
  const toggle = (key: string) => {
    const current = settings[key] === "true";
    setSetting(key, current ? "false" : "true");

    // Side-effects for auto-refresh
    if (key === "autoRefreshEnabled") {
      const interval = parseInt(settings.autoRefreshIntervalMin || "60", 10);
      bridge.refreshSetInterval(interval, !current);
      setTimeout(loadRefreshStatus, 200);
    }
  };

  const handleIntervalChange = (val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 5 || n > 1440) return;
    setSetting("autoRefreshIntervalMin", String(n));
    if (settings.autoRefreshEnabled === "true") {
      bridge.refreshSetInterval(n, true);
      setTimeout(loadRefreshStatus, 200);
    }
  };

  const handleManualRefresh = async () => {
    await bridge.refreshTrigger();
    showToast(t("refresh.trigger", locale), "success");
    setTimeout(loadRefreshStatus, 1000);
  };

  // ── Render helpers ──────────────────────────────────────────────────
  const isOn = (key: string) => settings[key] === "true";

  return (
    <div className="page page-settings">
      <h2 className="page-title">⚙️ {t("nav.settings", locale)}</h2>

      {/* ── Account ─────────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">👤 {t("settings.accountHeading", locale)}</h3>

        {authUser ? (
          <>
            <div className="settings-row">
              <label>{t("settings.email", locale)}</label>
              <span className="settings-value">{authUser.email}</span>
            </div>

            {authUser.displayName && (
              <div className="settings-row">
                <label>{t("settings.displayName", locale)}</label>
                <span className="settings-value">{authUser.displayName}</span>
              </div>
            )}

            <div className="settings-row">
              <label>{t("settings.plan", locale)}</label>
              <span className={`plan-badge plan-${authPlan.toLowerCase()}`}>
                {authPlan === "PRO" && billingInterval
                  ? `PRO (${billingInterval === "YEARLY" ? t("settings.yearly", locale) : t("settings.monthly", locale)})`
                  : authPlan}
                {subscriptionStatus === "TRIALING" && ` — ${t("settings.trialSuffix", locale)}`}
              </span>
              {isFoundingMember && (
                <span className="founding-badge" style={{ marginLeft: 8 }}>
                  🏅 {t("settings.foundingMember", locale)}
                </span>
              )}
            </div>

            {subscriptionStatus && subscriptionStatus !== "NONE" && (
              <div className="settings-row">
                <label>{t("settings.status", locale)}</label>
                <span
                  className={`settings-value${subscriptionStatus === "PAST_DUE" ? " text-warning" : ""}`}
                >
                  {subscriptionStatus === "TRIALING"
                    ? `${t("settings.trialEnds", locale, { date: trialEndsAt ? new Date(trialEndsAt).toLocaleDateString() : "" })}`
                    : subscriptionStatus === "PAST_DUE"
                      ? `⚠️ ${t("settings.paymentIssue", locale)}`
                      : subscriptionStatus === "CANCELED" && currentPeriodEnd
                        ? t("settings.canceledAccess", locale, {
                            date: new Date(currentPeriodEnd).toLocaleDateString(),
                          })
                        : subscriptionStatus}
                </span>
              </div>
            )}

            {billingInterval && (
              <div className="settings-row">
                <label>{t("settings.billing", locale)}</label>
                <span className="settings-value">
                  {billingInterval === "YEARLY"
                    ? t("settings.yearly", locale)
                    : t("settings.monthly", locale)}
                </span>
              </div>
            )}

            <div className="settings-row">
              <label>{t("settings.lastSync", locale)}</label>
              <span className="settings-value">
                {serverFlagsTimestamp
                  ? new Date(serverFlagsTimestamp).toLocaleString()
                  : t("settings.never", locale)}
              </span>
            </div>

            {(isOffline || usingCachedPlan) && (
              <div className="settings-row">
                <span className="settings-offline-notice">
                  ⚡ {t("settings.offlineCached", locale)}
                </span>
              </div>
            )}

            <div className="settings-row">
              <button className="btn-danger" onClick={authLogoutAction}>
                {t("settings.signOut", locale)}
              </button>
            </div>

            {/* ── Billing actions ─────────────────────────── */}
            <div className="settings-row settings-row-buttons">
              {authPlan !== "PRO" && (
                <>
                  <button
                    className="btn-primary"
                    disabled={billingLoading !== null}
                    onClick={async () => {
                      setBillingLoading("monthly");
                      logCheckoutStarted("monthly");
                      const res = await bridge.billingCheckout("monthly");
                      setBillingLoading(null);
                      if (!res.ok) showToast(t("settings.checkoutFailed", locale), "error");
                    }}
                  >
                    {billingLoading === "monthly"
                      ? t("settings.opening", locale)
                      : `⭐ Upgrade ${MONTHLY_LABEL}`}
                  </button>
                  <button
                    className="btn-primary btn-best-value"
                    disabled={billingLoading !== null}
                    onClick={async () => {
                      setBillingLoading("yearly");
                      logCheckoutStarted("yearly");
                      const res = await bridge.billingCheckout("yearly");
                      setBillingLoading(null);
                      if (!res.ok) showToast(t("settings.checkoutFailed", locale), "error");
                    }}
                  >
                    {billingLoading === "yearly"
                      ? t("settings.opening", locale)
                      : `⭐ Upgrade ${YEARLY_LABEL} (${YEARLY_PER_MONTH_LABEL})`}
                  </button>
                  <span className="settings-savings-note">{YEARLY_SAVINGS_LABEL}</span>
                </>
              )}

              {authPlan === "PRO" && (
                <button
                  className="btn-secondary"
                  disabled={billingLoading !== null}
                  onClick={async () => {
                    setBillingLoading("portal");
                    const res = await bridge.billingPortal();
                    setBillingLoading(null);
                    if (!res.ok) showToast(t("settings.portalFailed", locale), "error");
                  }}
                >
                  {billingLoading === "portal"
                    ? t("settings.opening", locale)
                    : `💳 ${t("settings.manageSubscription", locale)}`}
                </button>
              )}

              <button
                className="btn-secondary"
                onClick={async () => {
                  await fetchServerFeatures();
                  showToast(t("settings.planRefreshed", locale), "success");
                }}
              >
                🔄 {t("settings.refreshStatus", locale)}
              </button>
            </div>
          </>
        ) : (
          <div className="settings-row">
            <span className="settings-value" style={{ opacity: 0.7 }}>
              {t("settings.notSignedIn", locale)}
            </span>
            <button
              className="btn-primary"
              onClick={() => window.dispatchEvent(new CustomEvent("shogun:show-login"))}
            >
              {t("settings.signIn", locale)}
            </button>
          </div>
        )}
      </section>

      {/* ── Appearance ──────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">{t("settings.appearance", locale)}</h3>

        <div className="settings-row">
          <label>{t("settings.theme", locale)}</label>
          <select
            value={settings.theme || "dark"}
            onChange={(e) => setSetting("theme", e.target.value)}
          >
            <option value="dark">{t("settings.themeDark", locale)}</option>
            <option value="light">{t("settings.themeLight", locale)}</option>
            <option value="system">{t("settings.themeSystem", locale)}</option>
          </select>
        </div>

        <div className="settings-row">
          <label>{t("settings.locale", locale)}</label>
          <select
            value={settings.locale || locale}
            onChange={(e) => setSetting("locale", e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="ja">日本語</option>
          </select>
        </div>
      </section>

      {/* ── Auto Refresh ────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">{t("settings.autoRefresh", locale)}</h3>

        <div className="settings-row">
          <label>{t("settings.autoRefreshEnabled", locale)}</label>
          <button
            className={`toggle-btn ${isOn("autoRefreshEnabled") ? "on" : "off"}`}
            onClick={() => toggle("autoRefreshEnabled")}
          >
            {isOn("autoRefreshEnabled")
              ? t("refresh.enabled", locale)
              : t("refresh.disabled", locale)}
          </button>
        </div>

        <div className="settings-row">
          <label>{t("settings.autoRefreshInterval", locale)}</label>
          <select
            value={settings.autoRefreshIntervalMin || "60"}
            onChange={(e) => handleIntervalChange(e.target.value)}
          >
            <option value="5">5 min</option>
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="60">60 min</option>
            <option value="120">2 hr</option>
            <option value="360">6 hr</option>
            <option value="720">12 hr</option>
            <option value="1440">24 hr</option>
          </select>
        </div>

        {refreshStatus && (
          <div className="settings-row">
            <label>{t("refresh.lastRefresh", locale)}</label>
            <span className="settings-value">
              {refreshStatus.lastRefreshAt
                ? new Date(refreshStatus.lastRefreshAt).toLocaleString()
                : "—"}
            </span>
          </div>
        )}

        <div className="settings-row">
          <button className="btn-primary" onClick={handleManualRefresh}>
            🔄 {t("refresh.trigger", locale)}
          </button>
        </div>
      </section>

      {/* ── Playback ────────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">{t("settings.playback", locale)}</h3>

        <div className="settings-row">
          <label>{t("settings.resumeOnLaunch", locale)}</label>
          <button
            className={`toggle-btn ${isOn("resumeOnLaunch") ? "on" : "off"}`}
            onClick={() => toggle("resumeOnLaunch")}
          >
            {isOn("resumeOnLaunch") ? t("settings.on", locale) : t("settings.off", locale)}
          </button>
        </div>

        <div className="settings-row">
          <label>{t("settings.pipAlwaysOnTop", locale)}</label>
          <button
            className={`toggle-btn ${isOn("pipAlwaysOnTop") ? "on" : "off"}`}
            onClick={() => toggle("pipAlwaysOnTop")}
          >
            {isOn("pipAlwaysOnTop") ? t("settings.on", locale) : t("settings.off", locale)}
          </button>
        </div>
      </section>

      {/* ── Integrations ────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">{t("settings.integrations", locale)}</h3>

        <div className="settings-row">
          <label>{t("settings.discordRpc", locale)}</label>
          <button
            className={`toggle-btn ${isOn("discordRpcEnabled") ? "on" : "off"}`}
            onClick={() => toggle("discordRpcEnabled")}
          >
            {isOn("discordRpcEnabled") ? t("settings.on", locale) : t("settings.off", locale)}
          </button>
        </div>
      </section>
      {/* ── Cloud Sync (PRO) ────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">
          ☁️ Cloud Sync{" "}
          {!canUseCloudSync && (
            <span className="plan-badge plan-pro" style={{ marginLeft: 8, fontSize: "0.75em" }}>
              PRO
            </span>
          )}
        </h3>

        <div className="settings-row">
          <label>{t("settings.enableCloudSync", locale)}</label>
          <button
            className={`toggle-btn ${cloudSyncEnabled ? "on" : "off"}`}
            disabled={!canUseCloudSync}
            onClick={() => {
              setCloudSyncEnabled(!cloudSyncEnabled);
              if (!cloudSyncEnabled) {
                // Immediately push when enabling
                setTimeout(() => cloudPush(), 100);
              }
            }}
          >
            {cloudSyncEnabled ? t("settings.on", locale) : t("settings.off", locale)}
          </button>
        </div>

        {cloudSyncEnabled && (
          <>
            <div className="settings-row">
              <label>{t("settings.lastCloudSync", locale)}</label>
              <span className="settings-value">
                {cloudSyncLastAt
                  ? new Date(cloudSyncLastAt).toLocaleString()
                  : t("settings.never", locale)}
              </span>
            </div>

            <div className="settings-row">
              <button className="btn-secondary" disabled={cloudSyncing} onClick={() => cloudPush()}>
                {cloudSyncing
                  ? `↻ ${t("settings.syncing", locale)}`
                  : `☁️ ${t("settings.syncNow", locale)}`}
              </button>
            </div>
          </>
        )}
      </section>
      {/* ── Data ────────────────────────────────────────── */}
      <section className="settings-section">
        <h3 className="settings-heading">{t("settings.data", locale)}</h3>

        <div className="settings-row settings-row-buttons">
          <button
            className="btn-secondary"
            onClick={() => {
              const data = JSON.stringify(settings, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "stream-shogun-settings.json";
              a.click();
              URL.revokeObjectURL(url);
              showToast(t("settings.exported", locale), "success");
            }}
          >
            📤 {t("settings.export", locale)}
          </button>

          <button
            className="btn-secondary"
            onClick={async () => {
              const ALLOWED_KEYS = new Set([
                "theme",
                "locale",
                "autoRefreshEnabled",
                "autoRefreshIntervalMin",
                "resumeOnLaunch",
                "pipAlwaysOnTop",
                "discordRpcEnabled",
              ]);
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text) as Record<string, string>;
                  let imported = 0;
                  let skipped = 0;
                  for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === "string" && ALLOWED_KEYS.has(key)) {
                      await setSetting(key, value);
                      imported++;
                    } else {
                      skipped++;
                    }
                  }
                  showToast(
                    `${t("settings.imported", locale)} (${imported} applied${skipped ? `, ${skipped} skipped` : ""})`,
                    "success",
                  );
                } catch {
                  showToast("Invalid settings file", "error");
                }
              };
              input.click();
            }}
          >
            📥 {t("settings.import", locale)}
          </button>
        </div>
      </section>
    </div>
  );
}
