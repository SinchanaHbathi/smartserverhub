



import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const navigationItems = [
  { label: "Overview", icon: "▦" },
  { label: "Menu Management", icon: "☷" },
  { label: "Tables & QR Codes", icon: "▦" },
  { label: "Orders", icon: "▤" },
  { label: "Settings", icon: "⚙" },
];

function getRestaurant() {
  try {
    return JSON.parse(
      localStorage.getItem("smartserverhub_restaurant") ||
        localStorage.getItem("restaurant") ||
        "{}"
    );
  } catch {
    return {};
  }
}

function getToken() {
  return (
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

// Handle APIs that return either an array or an object containing an array.
function getArray(data, keys = []) {
  if (Array.isArray(data)) return data;

  if (!data || typeof data !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }

  return [];
}

// Read a table count from common table API response formats.
function getTableCount(data) {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return 0;

  const tableArray = getArray(data, ["tables", "items", "data"]);

  if (tableArray.length > 0) return tableArray.length;

  const countKeys = [
    "tableCount",
    "totalTables",
    "numberOfTables",
    "total",
  ];

  for (const key of countKeys) {
    if (
      typeof data[key] === "number" &&
      Number.isFinite(data[key]) &&
      data[key] >= 0
    ) {
      return data[key];
    }
  }

  if (data.data && typeof data.data === "object") {
    return getTableCount(data.data);
  }

  return 0;
}

// Count menu items from common saved-menu response formats.
function getMenuItemCount(data) {
  if (!data) return 0;

  // Your GET /api/menu route returns the menu object directly.
  if (Array.isArray(data)) {
    return data.length;
  }

  if (Array.isArray(data.items)) {
    return data.items.length;
  }

  if (Array.isArray(data.manualItems) ||
      Array.isArray(data.uploadedItems)) {
    const manualItems = Array.isArray(data.manualItems)
      ? data.manualItems
      : [];

    const uploadedItems = Array.isArray(data.uploadedItems)
      ? data.uploadedItems
      : [];

    if (data.publishMode === "manual") {
      return manualItems.length || data.items?.length || 0;
    }

    if (data.publishMode === "uploaded") {
      return uploadedItems.length || data.items?.length || 0;
    }

    if (data.publishMode === "both") {
      return manualItems.length + uploadedItems.length;
    }

    return data.items?.length || manualItems.length + uploadedItems.length;
  }

  return 0;
}
function isSameLocalDay(value, today) {
  if (!value) return false;

  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState("Overview");
  const [overview, setOverview] = useState({
    orders: null,
    revenue: null,
    tables: null,
    menuItems: null,
  });
  const [overviewError, setOverviewError] = useState("");

  const restaurant = getRestaurant();

  useEffect(() => {
    let cancelled = false;

    async function fetchApi(path) {
      const token = getToken();

      const response = await fetch(`${API_URL}${path}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const text = await response.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`${path} returned an invalid response.`);
      }

      if (!response.ok) {
        throw new Error(
          data.message || `Unable to load ${path} (${response.status}).`
        );
      }

      return data;
    }

    async function loadOverview() {
      setOverviewError("");

      // Load each section independently so one failed endpoint
      // does not prevent the other cards from displaying data.
      const results = await Promise.allSettled([
        fetchApi("/orders"),
        fetchApi("/tables"),
        fetchApi("/menu"),
      ]);

      if (cancelled) return;

      const errors = [];

      // Orders
      if (results[0].status === "fulfilled") {
        const ordersData = results[0].value;
        const orders = getArray(ordersData, [
          "orders",
          "data",
          "results",
        ]);

        const today = new Date();

        const todaysOrders = orders.filter((order) => {
          const orderDate =
            order.createdAt || order.created_at || order.date;

          return (
            isSameLocalDay(orderDate, today) &&
            String(order.status || "").toLowerCase() !== "cancelled"
          );
        });

        const todaysRevenue = todaysOrders.reduce((sum, order) => {
          if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
            return sum;
          }

          return sum + Number(order.total || 0);
        }, 0);

        setOverview((previous) => ({
          ...previous,
          orders: todaysOrders.length,
          revenue: todaysRevenue,
        }));
      } else {
        errors.push("orders");
        console.error("Dashboard orders error:", results[0].reason);
      }

      // Tables
      if (results[1].status === "fulfilled") {
        setOverview((previous) => ({
          ...previous,
          tables: getTableCount(results[1].value),
        }));
      } else {
        errors.push("tables");
        console.error("Dashboard tables error:", results[1].reason);
      }

      // Menu items
      if (results[2].status === "fulfilled") {
        setOverview((previous) => ({
          ...previous,
          menuItems: getMenuItemCount(results[2].value),
        }));
      } else {
        errors.push("menu");
        console.error("Dashboard menu error:", results[2].reason);
      }

      if (errors.length > 0) {
        setOverviewError(
          `Some dashboard data could not load: ${errors.join(", ")}.`
        );
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleNavigation(label) {
    setActivePage(label);

    if (label === "Overview") navigate("/dashboard");
    if (label === "Menu Management") navigate("/menu");
    if (label === "Tables & QR Codes") navigate("/qr");
    if (label === "Orders") navigate("/orders");
    if (label === "Settings") navigate("/settings");
  }

  function handleLogout() {
    localStorage.removeItem("smartserverhub_token");
    localStorage.removeItem("smartserverhub_restaurant");
    localStorage.removeItem("token");
    localStorage.removeItem("restaurant");

    navigate("/login", { replace: true });
  }

  function displayValue(value, isCurrency = false) {
    if (value === null) return "—";

    if (isCurrency) {
      return `₹${Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: 2,
      })}`;
    }

    return value.toLocaleString("en-IN");
  }

  return (
    <div className="sh-dashboard">
      <aside className="sh-sidebar">
        <div className="sh-brand">
          <div className="sh-brand-icon">S</div>
          <div>
            <h2>SmartServerHub</h2>
            <span>RESTAURANT PANEL</span>
          </div>
        </div>

        <div className="sh-sidebar-label">WORKSPACE</div>

        <nav className="sh-navigation">
          {navigationItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`sh-nav-item ${
                activePage === item.label ? "active" : ""
              }`}
              onClick={() => handleNavigation(item.label)}
            >
              <span className="sh-nav-icon">{item.icon}</span>
              <span>{item.label}</span>

              {item.label !== "Overview" && (
                <span className="sh-nav-arrow">›</span>
              )}
            </button>
          ))}
        </nav>

        <div
          style={{
            background: "#f0f7f1",
            border: "1px solid #dcebe0",
            borderRadius: "16px",
            padding: "18px",
            margin: "16px 0",
          }}
        >
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: "#d9efe0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
            }}
          >
            <span style={{ fontSize: "20px" }}>💡</span>
          </div>

          <h3
            style={{
              margin: "0 0 8px",
              fontSize: "16px",
              color: "#183d2b",
            }}
          >
            Smart Dining Tips
          </h3>

          <p
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#64756a",
            }}
          >
            Keep your menu updated, your QR codes accessible, and every order
            moving smoothly.
          </p>
        </div>

        <div>
          <button
            type="button"
            className="sh-logout-button"
            onClick={handleLogout}
          >
            <span>↪</span> Log out
          </button>
        </div>
      </aside>

      <main className="sh-main">
        <header className="sh-topbar">
          <div>
            <p className="sh-breadcrumb">Workspace / Dashboard</p>
            <h1>Dashboard</h1>
          </div>

          <div className="sh-profile">
            <div className="sh-profile-avatar">
              {(restaurant.name || "R").charAt(0).toUpperCase()}
            </div>

            <div className="sh-profile-details">
              <strong>{restaurant.name || "Your Restaurant"}</strong>
              <span>{restaurant.email || "Restaurant account"}</span>
            </div>
          </div>
        </header>

        <section className="sh-welcome-banner">
          <div>
            <span className="sh-welcome-tag">
              YOUR RESTAURANT WORKSPACE
            </span>

            <h2>
              Welcome{restaurant.name ? `, ${restaurant.name}` : " back"}!
            </h2>

            <p>
              Manage your menu, prepare your tables, and serve your customers
              with SmartServerHub.
            </p>

            <button
              type="button"
              className="sh-primary-button"
              onClick={() => navigate("/menu")}
            >
              Manage Your Menu <span>→</span>
            </button>
          </div>

          <div className="sh-banner-decoration" aria-hidden="true">
            <div className="sh-banner-circle sh-circle-one" />
            <div className="sh-banner-circle sh-circle-two" />
            <div className="sh-banner-symbol">S</div>
          </div>
        </section>

        <section className="sh-section-heading">
          <div>
            <h2>Restaurant Overview</h2>
            <p>Your restaurant workspace at a glance.</p>
          </div>
        </section>

        <section className="sh-stats-grid">
          <article className="sh-stat-card">
            <div className="sh-stat-top">
              <span>Today's Orders</span>
              <span className="sh-stat-icon">▤</span>
            </div>
            <strong>{displayValue(overview.orders)}</strong>
            <p>Orders received today</p>
          </article>

          <article className="sh-stat-card">
            <div className="sh-stat-top">
              <span>Today's Revenue</span>
              <span className="sh-stat-icon">₹</span>
            </div>
            <strong>{displayValue(overview.revenue, true)}</strong>
            <p>Paid orders today</p>
          </article>

          <article className="sh-stat-card">
            <div className="sh-stat-top">
              <span>Total Tables</span>
              <span className="sh-stat-icon">▦</span>
            </div>
            <strong>{displayValue(overview.tables)}</strong>
            <p>Configured restaurant tables</p>
          </article>

          <article className="sh-stat-card">
            <div className="sh-stat-top">
              <span>Menu Items</span>
              <span className="sh-stat-icon">☷</span>
            </div>
            <strong>{displayValue(overview.menuItems)}</strong>
            <p>Saved menu items</p>
          </article>
        </section>

        {overviewError && (
          <p
            role="status"
            style={{
              color: "#9a5b12",
              fontSize: "13px",
              marginTop: "10px",
            }}
          >
            {overviewError} Check the browser console for details.
          </p>
        )}

        <section className="sh-section-heading sh-quick-heading">
          <div>
            <h2>Quick Actions</h2>
            <p>Choose what you want to manage.</p>
          </div>
        </section>

        <section className="sh-actions-grid">
          <button
            type="button"
            className="sh-action-card"
            onClick={() => handleNavigation("Menu Management")}
          >
            <span className="sh-action-icon">☷</span>

            <span className="sh-action-content">
              <strong>Menu Management</strong>
              <span>
                Add food, organize categories, and update prices.
              </span>
            </span>

            <span className="sh-action-arrow">→</span>
          </button>

          <button
            type="button"
            className="sh-action-card"
            onClick={() => handleNavigation("Tables & QR Codes")}
          >
            <span className="sh-action-icon">▦</span>

            <span className="sh-action-content">
              <strong>Tables & QR Codes</strong>
              <span>
                Set up tables and generate customer QR codes.
              </span>
            </span>

            <span className="sh-action-arrow">→</span>
          </button>

          <button
            type="button"
            className="sh-action-card"
            onClick={() => handleNavigation("Orders")}
          >
            <span className="sh-action-icon">▤</span>

            <span className="sh-action-content">
              <strong>Manage Orders</strong>
              <span>
                View customer orders and update order status.
              </span>
            </span>

            <span className="sh-action-arrow">→</span>
          </button>
        </section>

        <footer className="sh-footer">
          <span>SmartServerHub</span>
          <span>Restaurant Management Workspace</span>
        </footer>
      </main>
    </div>
  );
}
