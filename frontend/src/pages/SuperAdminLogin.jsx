import { ROUTES } from "../constants/routes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { requiredText } from "../utils/validation";
import { checkAdminStatus, checkMustResetPassword } from "../services/adminService";

import appitureLogo from "../assets/appiture_logo.png";
import "./Login.css"; // reuse the same glassmorphic styles


const SIGN_IN_TIMEOUT_MS = 45000;

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);

function SuperAdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);

  /* ── If already logged in as platform admin, redirect straight to /platform-admin ── */
  useEffect(() => {
    if (!supabase) { setChecking(false); return; }

    let cancelled = false;
    const hydrate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session) { setChecking(false); return; }

        // Refresh admin status from DB
        const res = await checkAdminStatus({ force: true });
        if (!cancelled && res.success && res.data.isPlatformAdmin) {
          navigate(ROUTES.SUPER_ADMIN_DASHBOARD, { replace: true });
          return;
        }
      } catch {
        // Not authenticated or not an admin — show the form
      }
      if (!cancelled) setChecking(false);
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!requiredText(email)) throw new Error("Email is required.");
      if (!supabase) throw new Error("Supabase is not configured.");

      /* 1. Sign in */
      const { error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        SIGN_IN_TIMEOUT_MS,
        "Sign-in timed out. Check your connection and try again."
      );
      if (authError) throw authError;

      /* 2. Verify platform-admin status */
      const res = await checkAdminStatus({ force: true });
      if (!res.success || !res.data.isPlatformAdmin) {
        // Sign them back out — they have no business here
        await supabase.auth.signOut();
        throw new Error(res.message || "Access denied. This portal is for platform administrators only.");
      }

      /* 3. Check if this super admin must reset their password first */
      try {
        const resetRes = await checkMustResetPassword();
        if (resetRes.success && resetRes.data) {
          navigate(ROUTES.RESET_PASSWORD, { replace: true });
          return;
        }
      } catch {
        // Non-critical — let them into the admin panel
      }

      /* 4. All good → go to the Super Admin Dashboard */
      navigate(ROUTES.SUPER_ADMIN_DASHBOARD, { replace: true });
    } catch (err) {
      setError(err?.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)" }}>
        <p style={{ opacity: 0.5 }}>Checking session…</p>
      </div>
    );
  }

  return (
    <div
      className="login-screen"
      style={{
        backgroundColor: "var(--color-bg)",
      }}
    >


      {/* Glassmorphic panel */}
      <div
        className="glass-panel"
        style={{
          position: "relative", zIndex: 1,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-secondary)",
        }}
      >
        {/* Branding */}
        <div>
          <p className="glass-kicker" style={{ color: "var(--color-primary)", letterSpacing: "0.12em" }}>
            ⭐ Super Admin Portal
          </p>
          <h1 style={{ fontSize: 28, lineHeight: 1.2, marginTop: 8 }}>
            Platform Administration
          </h1>
          <p className="glass-subtitle">
            Restricted access — platform administrators only.
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--color-border)", margin: "0 -4px" }} />

        {/* Login form */}
        <form className="glass-form" onSubmit={handleSignIn}>
          <label>
            Admin Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="superadmin@platform.com"
              autoComplete="username"
              disabled={loading}
            />
          </label>

          <label>
            Password
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                style={{ paddingRight: "40px", width: "100%", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)",
                  padding: 0, display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && (
            <div
              className="error-banner"
              style={{
                background: "var(--color-bg-tertiary)",
                border: "1px solid var(--color-error)",
                color: "var(--color-error)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="glass-button"
            disabled={loading}
            style={{
              marginTop: 4,
            }}
          >
            {loading ? "Verifying…" : "Access Admin Panel"}
          </button>
        </form>

        {/* Back link */}
        <p style={{ textAlign: "center", fontSize: 12, opacity: 0.4, margin: 0 }}>
          Regular staff?{" "}
          <a
            href={ROUTES.LOGIN}
            style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}
          >
            Go to staff login →
          </a>
        </p>
      </div>

      {/* Footer */}
      <footer className="login-footer">
        <div className="login-footer-brand" style={{ opacity: 0.5 }}>
          <img src={appitureLogo} alt="Appiture" className="login-footer-logo" />
          <span style={{ fontSize: 11 }}>Developed by <strong>Appiture</strong> · Platform Admin v2</span>
        </div>
      </footer>
    </div>
  );
}

export default SuperAdminLogin;




