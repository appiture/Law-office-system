import { ROUTES } from "../constants/routes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#060f1e", color: "#f8fafc" }}>
        <p style={{ opacity: 0.5 }}>Checking session…</p>
      </div>
    );
  }

  return (
    <div
      className="login-screen"
      style={{
        backgroundColor: "#060f1e",
      }}
    >


      {/* Glassmorphic panel */}
      <div
        className="glass-panel"
        style={{
          position: "relative", zIndex: 1,
          border: "1px solid rgba(201,163,78,0.25)",
          background: "rgba(6, 15, 30, 0.75)",
        }}
      >
        {/* Branding */}
        <div>
          <p className="glass-kicker" style={{ color: "#C9A34E", letterSpacing: "0.12em" }}>
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
        <div style={{ height: 1, background: "rgba(201,163,78,0.15)", margin: "0 -4px" }} />

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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
            />
          </label>

          {error && (
            <div
              className="error-banner"
              style={{
                background: "rgba(248,113,113,0.12)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#FCA5A5",
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
              background: loading
                ? "rgba(201,163,78,0.5)"
                : "linear-gradient(135deg, #C9A34E, #a07830)",
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
            style={{ color: "#FBBF24", textDecoration: "none", fontWeight: 600 }}
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




