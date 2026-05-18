import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { requiredText } from "../utils/validation";
import {
  getRememberedEmail,
  getWorkspaceAccessMessage,
  isAuthenticated,
  setRememberedEmail,
  syncSupabaseSession,
} from "../services/authService";
import { checkMustResetPassword, checkAdminStatus } from "../services/adminService";
import { ROUTES } from "../constants/routes";
import appitureLogo from "../assets/appiture_logo.png";
import "./Login.css";


const SIGN_IN_TIMEOUT_MS = 45000;

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(getRememberedEmail());
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(getRememberedEmail()));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    const hydrate = async () => {
      try {
        const session = await syncSupabaseSession();
        if (cancelled) return;
        if (isAuthenticated()) {
          if (session?.canAccessWorkspace) {
            navigate(ROUTES.DASHBOARD, { replace: true });
          } else {
            // Could be a platform admin (no org workspace) — check before giving up
            const res = await checkAdminStatus({ force: true });
            if (!cancelled && res.success && res.data.isPlatformAdmin) {
              navigate(ROUTES.SUPER_ADMIN_DASHBOARD, { replace: true });
            }
          }
        }
      } catch {
        // Keep the sign-in form visible if the session is not ready yet.
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [navigate]);

  const persistRememberedFields = () => {
    setRememberedEmail(email, rememberMe);
  };

  const goToWorkspace = async () => {
    const session = await syncSupabaseSession();
    persistRememberedFields();

    if (session?.canAccessWorkspace) {
      // Check if this is a first-login account that must reset its password
      try {
        const res = await checkMustResetPassword();
        if (res.success && res.data) {
          navigate(ROUTES.RESET_PASSWORD, { replace: true });
          return;
        }
      } catch {
        // Non-critical — let them into the workspace
      }
      navigate(ROUTES.DASHBOARD, { replace: true });
      return;
    }

    setError(getWorkspaceAccessMessage() || "Your account does not have an active workspace assigned.");
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!requiredText(email)) {
        throw new Error("Email is required.");
      }

      if (!supabase) {
        throw new Error(
          "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file."
        );
      }

      const { error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        SIGN_IN_TIMEOUT_MS,
        "Supabase sign-in timed out. Check your internet connection, Supabase URL, and Auth settings."
      );

      if (authError) throw authError;
      await goToWorkspace();
    } catch (authError) {
      const message =
        authError?.message ||
        authError?.error_description ||
        "Unable to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen" style={{ backgroundColor: "#0B1F3A" }}>
      <div className="glass-panel" style={{ position: "relative", zIndex: 1 }}>
        <div>
          <p className="glass-kicker">Secure Access</p>
          <h1>Law Office Management Platform</h1>
          <p className="glass-subtitle">
            Sign in to access the active law office workspace.
          </p>
        </div>

        <form className="glass-form" onSubmit={handleSignIn}>
          <label>
            Email
            <input value={email} type="email" onChange={(event) => setEmail(event.target.value)} required placeholder="admin@example.com" />
          </label>

          <label>
            Password
            <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} required placeholder="••••••••" />
          </label>

          <label className="inline-check">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            Remember email on this device
          </label>

          {error ? <div className="error-banner">{error}</div> : null}

          <button type="submit" className="glass-button" disabled={loading}>
            {loading ? "Working..." : "Sign in"}
          </button>
        </form>
      </div>

      <footer className="login-footer">
        <div className="login-footer-brand">
          <img src={appitureLogo} alt="Appiture" className="login-footer-logo" />
          <span>Developed by <strong>Appiture</strong></span>
        </div>
        <p>for queries contact <a href="https://www.appiture.in" target="_blank" rel="noopener noreferrer">www.appiture.in</a></p>
        <p style={{ marginTop: 12, fontSize: 11, opacity: 0.35 }}>
          <Link to={ROUTES.SUPER_ADMIN_LOGIN} style={{ color: "#FBBF24", textDecoration: "none" }}>
            ⭐ Super Admin Portal
          </Link>
        </p>
      </footer>
    </div>
  );
}

export default Login;




