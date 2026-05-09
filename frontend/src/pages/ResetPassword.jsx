import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient";
import { completePasswordReset } from "../services/adminService";
import { syncSupabaseSession } from "../services/authService";
import DotGrid from "../components/ui/DotGrid/DotGrid";
import appitureLogo from "../assets/appiture_logo.png";
import "./Login.css"; // reuse Login styles


const MIN_LENGTH = 8;

function strengthLabel(pw) {
  if (!pw) return { label: "", color: "transparent", width: "0%" };
  let score = 0;
  if (pw.length >= MIN_LENGTH) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Weak",   color: "#F87171", width: "25%" },
    { label: "Fair",   color: "#FBBF24", width: "50%" },
    { label: "Good",   color: "#60A5FA", width: "75%" },
    { label: "Strong", color: "#34D399", width: "100%" },
  ];
  return map[score - 1] || { label: "Weak", color: "#F87171", width: "25%" };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword]     = useState("");
  const [confirmPass, setConfirmPass]     = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [success, setSuccess]             = useState(false);

  const strength = strengthLabel(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // 1. Update the password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      // 2. Clear the must_reset_password flag in public.users
      await completePasswordReset();

      // 3. Refresh the session cache so canAccessWorkspace is up to date
      await syncSupabaseSession(null, { force: true });

      setSuccess(true);
      setTimeout(() => navigate("/dashboard", { replace: true }), 2000);
    } catch (err) {
      setError(err?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-screen"
      style={{
        backgroundColor: "#0B1F3A",
      }}
    >
      {/* Animated background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
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

      <div className="glass-panel" style={{ position: "relative", zIndex: 1, maxWidth: 420, width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <p className="glass-kicker" style={{ color: "#C9A34E" }}>🔐 Security Required</p>
          <h1 style={{ margin: "4px 0 8px", fontSize: 22, fontWeight: 800, color: "#fff" }}>
            Set Your Password
          </h1>
          <p className="glass-subtitle" style={{ color: "rgba(255,255,255,.55)", fontSize: 13 }}>
            This is your first login. Please choose a strong, unique password to secure your account.
          </p>
        </div>

        {success ? (
          <div style={{
            background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.35)",
            borderRadius: 12, padding: "18px 20px", textAlign: "center",
          }}>
            <p style={{ margin: 0, color: "#34D399", fontWeight: 700, fontSize: 15 }}>
              ✅ Password updated! Redirecting to dashboard…
            </p>
          </div>
        ) : (
          <form className="glass-form" onSubmit={handleSubmit} style={{ gap: 16 }}>
            {/* New password */}
            <label>
              New Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={MIN_LENGTH}
                placeholder="At least 8 characters"
                disabled={loading}
                autoComplete="new-password"
              />
            </label>

            {/* Strength meter */}
            {newPassword && (
              <div style={{ marginTop: -8 }}>
                <div style={{
                  height: 4, borderRadius: 4, background: "rgba(255,255,255,.1)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    width: strength.width,
                    background: strength.color,
                    transition: "width .3s, background .3s",
                  }} />
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: strength.color, fontWeight: 600 }}>
                  {strength.label}
                </p>
              </div>
            )}

            {/* Confirm password */}
            <label>
              Confirm Password
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                required
                placeholder="Repeat your new password"
                disabled={loading}
                autoComplete="new-password"
              />
            </label>

            {/* Password rules hint */}
            <ul style={{
              margin: "0", padding: "10px 14px",
              background: "rgba(201,163,78,.06)", border: "1px solid rgba(201,163,78,.18)",
              borderRadius: 10, listStyle: "none", display: "flex", flexDirection: "column", gap: 4,
            }}>
              {[
                [`${newPassword.length >= MIN_LENGTH}`, `At least ${MIN_LENGTH} characters`],
                [`${/[A-Z]/.test(newPassword)}`, "One uppercase letter"],
                [`${/[0-9]/.test(newPassword)}`, "One number"],
                [`${/[^A-Za-z0-9]/.test(newPassword)}`, "One special character"],
              ].map(([met, rule]) => (
                <li key={rule} style={{ fontSize: 12, color: met === "true" ? "#34D399" : "rgba(255,255,255,.4)", display: "flex", gap: 8 }}>
                  <span>{met === "true" ? "✓" : "○"}</span> {rule}
                </li>
              ))}
            </ul>

            {error && <div className="error-banner">{error}</div>}

            <button
              type="submit"
              className="glass-button"
              disabled={loading || !newPassword || !confirmPass}
              style={{ marginTop: 4 }}
            >
              {loading ? "Updating…" : "Set New Password & Continue"}
            </button>
          </form>
        )}
      </div>

      <footer className="login-footer">
        <div className="login-footer-brand">
          <img src={appitureLogo} alt="Appiture" className="login-footer-logo" />
          <span>Developed by <strong>Appiture</strong></span>
        </div>
        <p>for queries contact <a href="https://www.appiture.in" target="_blank" rel="noopener noreferrer">www.appiture.in</a></p>
      </footer>
    </div>
  );
}




