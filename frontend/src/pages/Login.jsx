import "./Login.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import {
  getRememberedEmail,
  isAuthenticated,
  isRememberEmailEnabled,
  setRememberedEmail,
  storeAuthSession,
} from "../utils/auth";
import loginScalePng from "../assets/image.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpChallengeId, setOtpChallengeId] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const navigate = useNavigate();
  const isOtpStep = Boolean(otpChallengeId);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard", { replace: true });
      return;
    }

    localStorage.removeItem("remember_password");

    if (isRememberEmailEnabled()) {
      const rememberedEmail = getRememberedEmail();
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberMe(true);
      }
    }
  }, [navigate]);

  const persistLogin = (data, fallbackEmail) => {
    storeAuthSession(data, fallbackEmail, rememberMe);
    setRememberedEmail(data.email || fallbackEmail, rememberMe);
    navigate("/dashboard", { replace: true });
  };

  const extractErrorMessage = (error, fallback = "Login failed") => {
    if (typeof error?.response?.data === "string") {
      return error.response.data;
    }
    if (error?.response?.data?.details) {
      return `${error.response.data.message || fallback} (${error.response.data.details})`;
    }
    return (
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      fallback
    );
  };

  const requestOtp = async () => {
    const response = await axios.post("/auth/login", {
      email: email.trim(),
      password: password.trim(),
      rememberMe,
    });

    const payload = response?.data || {};

    if (payload.token) {
      persistLogin(payload, email);
      return;
    }

    const challengeId =
      payload.challengeId ||
      payload.otpChallengeId ||
      payload.challengeID ||
      payload.challenge;
    const otpRequired =
      typeof payload.otpRequired === "boolean" ? payload.otpRequired : Boolean(challengeId);

    if (!otpRequired || !challengeId) {
      throw new Error("OTP setup failed. Please ensure email service is configured.");
    }

    setOtpChallengeId(challengeId);
    setOtpExpiresAt(payload.expiresAt || "");
    setOtp("");
    setInfoMsg(payload.message || "OTP sent to approver email");
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      await requestOtp();
    } catch (error) {
      setErrorMsg(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const response = await axios.post("/auth/verify-otp", {
        challengeId: otpChallengeId,
        otp: otp.trim(),
        rememberMe,
      });
      persistLogin(response.data, email);
    } catch (error) {
      setErrorMsg(extractErrorMessage(error, "OTP verification failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      await requestOtp();
      setInfoMsg("OTP resent to approver email");
    } catch (error) {
      setErrorMsg(extractErrorMessage(error, "Failed to resend OTP"));
    } finally {
      setLoading(false);
    }
  };

  const resetToCredentials = () => {
    if (loading) return;
    setOtp("");
    setOtpChallengeId("");
    setOtpExpiresAt("");
    setErrorMsg("");
    setInfoMsg("");
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="logo-circle">
          <img src={loginScalePng} alt="Justice scale" className="login-logo-image" />
        </div>
        <h1>Law Office</h1>
        <h2>Management System</h2>
        <p>Manage your cases, clients and billing efficiently.</p>
      </div>

      <div className="login-right">
        <form className="login-card" onSubmit={isOtpStep ? handleVerifyOtp : handleCredentialsSubmit}>
          <h3>{isOtpStep ? "OTP Verification" : "Welcome Back"}</h3>
          {isOtpStep && (
            <p className="login-subtext">
              OTP was sent to the approver email. Enter the 6-digit code to continue.
            </p>
          )}

          {errorMsg && <div className="error-box">{errorMsg}</div>}
          {infoMsg && <div className="info-box">{infoMsg}</div>}

          {isOtpStep ? (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="login-otp">
                  OTP
                </label>
                <input
                  id="login-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  disabled={loading}
                />
              </div>

              {otpExpiresAt && <p className="otp-expiry">Valid till: {new Date(otpExpiresAt).toLocaleString()}</p>}

              <button type="submit" disabled={loading || otp.length !== 6}>
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              <div className="otp-actions">
                <button type="button" className="secondary-btn" onClick={handleResendOtp} disabled={loading}>
                  Resend OTP
                </button>
                <button type="button" className="secondary-btn" onClick={resetToCredentials} disabled={loading}>
                  Change Credentials
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="login-field">
                <label className="login-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <div className="password-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="remember-me-field">
                <label className="remember-me-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <button type="submit" disabled={loading}>
                {loading ? "Sending OTP..." : "Send OTP"}
              </button>
            </>
          )}
        </form>
      </div>

      <footer className="login-footmark">
        <span className="footmark-logo" aria-hidden="true">
          A
        </span>
        <span className="footmark-text">Developed by Appiture</span>
      </footer>
    </div>
  );
}

export default Login;
