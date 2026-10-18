
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    address: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...payload } = form;

      const response = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed.");
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
          <span className="eyebrow">GET STARTED</span>
          <h1>Register your restaurant</h1>
          <p>Create your manager account and set up your restaurant.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Restaurant name
            <input
              name="name"
              value={form.name}
              onChange={update}
              placeholder="Enter restaurant name"
              maxLength={120}
              required
            />
          </label>

          <label>
            Email address
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={update}
              placeholder="you@restaurant.com"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>

          <label>
            Password
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={form.password}
                onChange={update}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label>
            Confirm password
            <div className="password-input-wrap">
              <input
                type={showConfirm ? "text" : "password"}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={update}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                minLength={8}
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

          <label>
            Phone number <span className="optional">(optional)</span>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={update}
              placeholder="Restaurant contact number"
              maxLength={30}
            />
          </label>

          <label>
            Restaurant address <span className="optional">(optional)</span>
            <input
              name="address"
              value={form.address}
              onChange={update}
              placeholder="City, area, address"
              maxLength={300}
            />
          </label>

          {error && <p className="error-message" role="alert">{error}</p>}

          <button className="primary-button" disabled={loading}>
            {loading ? "Creating account..." : "Create restaurant account"}
          </button>
        </form>

        <p className="auth-footer">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>

      <aside className="auth-aside">
        <div className="aside-content">
          <span className="aside-tag">SMARTER RESTAURANT MANAGEMENT</span>
          <h2>Your restaurant.<br />One simple system.</h2>
          <p>
            Manage tables, menus, orders and payments from one
            convenient dashboard.
          </p>
          <div className="feature-line">01 &nbsp; QR-based ordering</div>
          <div className="feature-line">02 &nbsp; Live order management</div>
          <div className="feature-line">03 &nbsp; Sales insights</div>
        </div>
      </aside>
    </main>
  );
}
