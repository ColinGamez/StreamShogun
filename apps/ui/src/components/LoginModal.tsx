// ── LoginModal — Cloud account login/register ─────────────────────────
//
// Triggered via the `shogun:show-login` CustomEvent or from the account
// button in the sidebar. Handles both login and registration flows.

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { useAppStore } from "../stores/app-store";

type Mode = "login" | "register";

export function LoginModal() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const authLoading = useAppStore((s) => s.authLoading);
  const authError = useAppStore((s) => s.authError);
  const authUser = useAppStore((s) => s.authUser);
  const authLoginAction = useAppStore((s) => s.authLoginAction);
  const authRegisterAction = useAppStore((s) => s.authRegisterAction);
  const authLogoutAction = useAppStore((s) => s.authLogoutAction);
  const authPlan = useAppStore((s) => s.authPlan);

  const emailRef = useRef<HTMLInputElement>(null);

  // Listen for custom event to open the modal
  useEffect(() => {
    const handler = () => {
      setError("");
      setOpen(true);
    };
    window.addEventListener("shogun:show-login", handler);
    return () => window.removeEventListener("shogun:show-login", handler);
  }, []);

  // Auto-focus email input when modal opens
  useEffect(() => {
    if (open) setTimeout(() => emailRef.current?.focus(), 80);
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

  // Sync store errors to local error state
  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError("");

      if (!email.trim() || !password.trim()) {
        setError("Email and password are required");
        return;
      }

      let success: boolean;
      if (mode === "login") {
        success = await authLoginAction(email.trim(), password);
      } else {
        success = await authRegisterAction(email.trim(), password, displayName.trim() || undefined);
      }

      if (success) {
        setOpen(false);
        setEmail("");
        setPassword("");
        setDisplayName("");
      }
    },
    [mode, email, password, displayName, authLoginAction, authRegisterAction]
  );

  const handleLogout = useCallback(async () => {
    await authLogoutAction();
    setOpen(false);
  }, [authLogoutAction]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div
        className="modal-dialog login-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={authUser ? "Account" : mode === "login" ? "Sign In" : "Create Account"}
      >
        {/* ── Signed-in view ─────────────────────────────────── */}
        {authUser ? (
          <>
            <h2 className="modal-title">Account</h2>
            <div className="login-account-info">
              <p>
                <strong>{authUser.displayName || authUser.email}</strong>
              </p>
              <p className="login-email">{authUser.email}</p>
              <p className="login-plan">
                Plan: <span className={`plan-badge plan-${authPlan.toLowerCase()}`}>{authPlan}</span>
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
              <button className="btn btn-danger" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </>
        ) : (
          /* ── Login / Register form ───────────────────────────── */
          <>
            <h2 className="modal-title">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>

            <form onSubmit={handleSubmit} className="login-form">
              {mode === "register" && (
                <label className="login-field">
                  <span>Display Name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="login-field">
                <span>Email</span>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label className="login-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </label>

              {error && <p className="login-error">{error}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={authLoading}
                >
                  {authLoading
                    ? "Please wait…"
                    : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
                </button>
              </div>
            </form>

            <p className="login-toggle">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button className="btn-link" onClick={() => { setMode("register"); setError(""); }}>
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button className="btn-link" onClick={() => { setMode("login"); setError(""); }}>
                    Sign in
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
