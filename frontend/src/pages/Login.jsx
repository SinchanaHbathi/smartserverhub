
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";

const API = (
  import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com/api"
).replace(/\/+$/, "");

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      localStorage.setItem("smartserverhub_token", data.token);
      localStorage.setItem(
        "smartserverhub_restaurant",
        JSON.stringify(data.restaurant)
      );

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
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

        <div className="auth-heading">
          <span className="eyebrow">WELCOME BACK</span>
          <h1>Sign in to your account</h1>
          <p>
            Manage your restaurant from your personal dashboard.
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@restaurant.com"
              maxLength={254}
              required
            />
          </label>

          <label>
            Password
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                maxLength={128}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="forgot-row">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          New to SmartServerHub?{" "}
          <Link to="/register">Register your restaurant</Link>
        </p>
      </section>

      <aside className="auth-aside">
        <div className="aside-content">
          <span className="aside-tag">
            YOUR RESTAURANT, SIMPLIFIED
          </span>

          <h2>
            Everything in place.
            <br />
            Every order connected.
          </h2>

          <p>
            Manage your menu, tables, orders and payments from one
            convenient workspace.
          </p>

          <div className="feature-line">
            01 &nbsp; Menu management
          </div>
          <div className="feature-line">
            02 &nbsp; Table QR codes
          </div>
          <div className="feature-line">
            03 &nbsp; Order tracking
          </div>
        </div>
      </aside>
    </main>
  );
}
