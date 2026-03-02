// ── UpgradeModal — licence activation & feature list ──────────────────
//
// Listens for the `shogun:request-upgrade` CustomEvent and opens a
// modal dialogue showing all Pro features + a licence-key input.
// This is the **only** place users enter their key.

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import type {
  Feature} from "@stream-shogun/core";
import {
  ALL_PRO_FEATURES,
  FEATURE_META,
  type LicenseStatus,
} from "@stream-shogun/core";
import { useAppStore } from "../stores/app-store";

export function UpgradeModal() {
  const [open, setOpen] = useState(false);
  const [highlightFeature, setHighlightFeature] = useState<Feature | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  const license = useAppStore((s) => s.license);
  const activateLicenseKey = useAppStore((s) => s.activateLicenseKey);
  const isPro = license.isProEnabled;

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Listen for the custom upgrade event ─────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ feature?: Feature }>).detail;
      setHighlightFeature(detail?.feature ?? null);
      setError("");
      setOpen(true);
    };
    window.addEventListener("shogun:request-upgrade", handler);
    return () => window.removeEventListener("shogun:request-upgrade", handler);
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

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
    setError("");
    setKeyInput("");
  }, []);

  const handleActivate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!keyInput.trim()) return;
      setActivating(true);
      setError("");

      const result: LicenseStatus | null = await activateLicenseKey(keyInput.trim().toUpperCase());

      setActivating(false);

      if (result && result.validationState === "valid") {
        // Success — close after a brief pause so the user sees the checkmark
        setTimeout(handleClose, 600);
      } else {
        setError("Invalid license key. Format: SS-XXXX-XXXX-XXXX-XXXX");
      }
    },
    [keyInput, activateLicenseKey, handleClose],
  );

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal upgrade-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Pro"
      >
        {/* Header */}
        <div className="upgrade-modal-header">
          <h2>⭐ Upgrade to Pro</h2>
          <button className="modal-close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Feature list */}
        <div className="upgrade-feature-list">
          {ALL_PRO_FEATURES.map((f) => {
            const meta = FEATURE_META[f];
            const isHighlighted = f === highlightFeature;
            return (
              <div
                key={f}
                className={`upgrade-feature-row${isHighlighted ? " highlighted" : ""}${isPro ? " enabled" : ""}`}
              >
                <span className="upgrade-feature-icon">{meta.icon}</span>
                <div className="upgrade-feature-text">
                  <span className="upgrade-feature-label">{meta.label}</span>
                  <span className="upgrade-feature-desc">{meta.description}</span>
                </div>
                <span className="upgrade-feature-status">
                  {isPro ? "✅" : "🔒"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Activation form */}
        {!isPro && (
          <form className="upgrade-form" onSubmit={handleActivate}>
            <label htmlFor="license-key-input">License Key</label>
            <div className="upgrade-input-row">
              <input
                ref={inputRef}
                id="license-key-input"
                type="text"
                placeholder="SS-XXXX-XXXX-XXXX-XXXX"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className={error ? "input-error" : ""}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={activating || !keyInput.trim()}
              >
                {activating ? "Activating…" : "Activate"}
              </button>
            </div>
            {error && <p className="upgrade-error">{error}</p>}
          </form>
        )}

        {isPro && (
          <div className="upgrade-activated">
            <span className="upgrade-activated-icon">✅</span>
            <p>Pro features are <strong>active</strong>. Thank you!</p>
          </div>
        )}
      </div>
    </div>
  );
}
