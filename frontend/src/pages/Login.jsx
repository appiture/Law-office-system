import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import DotGrid from "../components/ui/DotGrid/DotGrid";
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
            navigate("/dashboard", { replace: true });
          } else {
            // Could be a platform admin (no org workspace) — check before giving up
            const { isPlatformAdmin: isAdmin } = await checkAdminStatus({ force: true });
            if (!cancelled && isAdmin) {
              navigate("/platform-admin", { replace: true });
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
        const mustReset = await checkMustResetPassword();
        if (mustReset) {
          navigate("/reset-password", { replace: true });
          return;
        }
      } catch {
        // Non-critical — let them into the workspace
      }
      navigate("/dashboard", { replace: true });
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
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <DotGrid
          baseColor="#1E3A8A"
          activeColor="#C9A34E"
          dotSize={2}
          gap={20}
          proximity={150}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
        />
      </div>

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
          <a href="/super-admin-login" style={{ color: "#FBBF24", textDecoration: "none" }}>
            ⭐ Super Admin Portal
          </a>
        </p>
      </footer>
    </div>
  );
}

export default Login;




