
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com/api";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendCode(e) {
    e?.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to send the code.");
      }

      setStep("verify");
      setMessage(data.message);
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{4}$/.test(code)) {
      setError("Enter the complete 4-digit verification code.");
      return;
    }

    if (password.length < 6) {
      setError("Your new password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          newPassword: password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Password reset failed.");
      }

      setStep("success");
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Link className="brand" to="/login">
          <span className="brand-icon">S</span>
          SmartServerHub
        </Link>

        {step === "email" && (
          <>
            <div className="auth-heading">
              <span className="eyebrow">ACCOUNT RECOVERY</span>
              <h1>Forgot your password?</h1>
              <p>
                Enter your registered email address to request a
                verification code.
              </p>
            </div>

            <form className="auth-form" onSubmit={sendCode}>
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@restaurant.com"
                  maxLength={254}
                  required
                />
              </label>

              {error && <p className="error-message" role="alert">{error}</p>}
              {message && <p className="success-message" role="status">{message}</p>}

              <button className="primary-button" disabled={loading}>
                {loading ? "Sending..." : "Send verification code"}
              </button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <div className="auth-heading">
              <span className="eyebrow">VERIFY YOUR EMAIL</span>
              <h1>Create a new password</h1>
              <p>
                Enter the 4-digit code sent to <strong>{email}</strong>.
                The code expires in 5 minutes.
              </p>
            </div>

            <form className="auth-form" onSubmit={resetPassword}>
              <label>
                4-digit verification code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="0000"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  required
                />
              </label>

              <label>
                New password
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    minLength={6}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide new password" : "Show new password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label>
                Confirm new password
                <div className="password-input-wrap">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    minLength={6}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
                  >
                    {showConfirm ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {error && <p className="error-message" role="alert">{error}</p>}

              <button className="primary-button" disabled={loading}>
                {loading ? "Resetting password..." : "Reset password"}
              </button>
            </form>

            <button
              type="button"
              className="text-button"
              onClick={sendCode}
              disabled={loading}
            >
              Resend code
            </button>

            <p className="helper-text">
              Requesting another code invalidates the previous code.
            </p>
          </>
        )}

        {step === "success" && (
          <div className="reset-success">
            <div className="success-icon" aria-hidden="true">✓</div>
            <span className="eyebrow">PASSWORD UPDATED</span>
            <h1>Password reset successful!</h1>
            <p>
              Your password has been changed. You can now sign in
              using your new password.
            </p>
            <button
              className="primary-button"
              onClick={() => navigate("/login", { replace: true })}
            >
              Back to login
            </button>
          </div>
        )}

        {step !== "success" && (
          <p className="auth-footer">
            Remember your password? <Link to="/login">Back to login</Link>
          </p>
        )}
      </section>

      <aside className="auth-aside">
        <div className="aside-content">
          <span className="aside-tag">SECURE ACCOUNT RECOVERY</span>
          <h2>A fresh start.<br />A secure account.</h2>
          <p>
            Verify your email and create a new password to regain
            access to your restaurant dashboard.
          </p>
          <div className="feature-line">01 &nbsp; Email verification</div>
          <div className="feature-line">02 &nbsp; Five-minute code expiry</div>
          <div className="feature-line">03 &nbsp; Secure password hashing</div>
        </div>
      </aside>
    </main>
  );
}
