
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const STATUSES = ["Confirmed", "Preparing", "Ready", "Served"];

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function getSavedToken() {
  return (
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

function formatDate(date) {
  if (!date) return "Date unavailable";

  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ManagerOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");

  const token = getSavedToken();

  const loadOrders = useCallback(
    async (manual = false) => {
      if (!token) {
        setError("Please log in to view restaurant orders.");
        setLoading(false);
        return;
      }

      if (manual) setRefreshing(true);

      try {
        const data = await apiRequest("/orders", token);

        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setError("");
      } catch (err) {
        setError(err.message || "Unable to load orders.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadOrders();

    const timer = setInterval(() => {
      loadOrders();
    }, 5000);

    return () => clearInterval(timer);
  }, [loadOrders]);

  async function updateOrder(orderId, action, payload = {}) {
    setBusyOrderId(orderId);
    setError("");
    setNotice("");

    try {
      const data = await apiRequest(
        `/orders/${orderId}/${action}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      setNotice(data.message || "Order updated successfully.");
      await loadOrders();
    } catch (err) {
      setError(err.message || "Unable to update order.");
    } finally {
      setBusyOrderId("");
    }
  }

  async function changeStatus(order, status) {
    await updateOrder(order._id, "status", { status });
  }

  async function confirmPayment(order) {
    const confirmed = window.confirm(
      `Confirm that ₹${Number(order.total || 0).toFixed(2)} has actually been received for this order?`
    );

    if (!confirmed) return;

    await updateOrder(order._id, "payment", {});
  }

  async function cancelOrder(order) {
    const confirmed = window.confirm(
      `Cancel the order for Table ${order.tableNumber}?`
    );

    if (!confirmed) return;

    const reason =
      window.prompt("Cancellation reason (optional):") || "";

    await updateOrder(order._id, "cancel", { reason });
  }

  const activeOrders = orders.filter(
    (order) => order.status !== "Cancelled" && order.status !== "Served"
  );

  const completedOrders = orders.filter(
    (order) => order.status === "Served" || order.status === "Cancelled"
  );

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>SMARTSERVERHUB RESTAURANT PANEL</p>
          <h1 style={styles.title}>Order Management</h1>
          <p style={styles.subtitle}>
            Monitor customer orders, payments, and preparation status.
          </p>
        </div>

        <div style={styles.headerButtons}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={() => loadOrders(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {notice && <div style={styles.notice}>{notice}</div>}

      <section style={styles.stats}>
        <article style={styles.statCard}>
          <span>All Orders</span>
          <strong>{orders.length}</strong>
        </article>

        <article style={styles.statCard}>
          <span>Active Orders</span>
          <strong>{activeOrders.length}</strong>
        </article>

        <article style={styles.statCard}>
          <span>Payments Pending</span>
          <strong>
            {
              orders.filter(
                (order) =>
                  order.paymentStatus !== "Paid" &&
                  order.status !== "Cancelled"
              ).length
            }
          </strong>
        </article>
      </section>

      <section>
        <div style={styles.sectionHeading}>
          <div>
            <h2 style={styles.sectionTitle}>Live Orders</h2>
            <p style={styles.subtitle}>
              Automatically refreshes every five seconds.
            </p>
          </div>
          <span style={styles.liveBadge}>● LIVE</span>
        </div>

        {loading ? (
          <p style={styles.message}>Loading orders...</p>
        ) : activeOrders.length === 0 ? (
          <div style={styles.empty}>
            <h3>No active orders yet</h3>
            <p>
              New customer orders will appear here when the QR ordering flow
              is connected.
            </p>
          </div>
        ) : (
          <div style={styles.orderGrid}>
            {activeOrders.map((order) => (
              <article key={order._id} style={styles.orderCard}>
                <div style={styles.orderHeader}>
                  <div>
                    <span style={styles.orderNumber}>
                      Order #{String(order._id).slice(-6).toUpperCase()}
                    </span>
                    <h3 style={styles.tableTitle}>
                      Table {order.tableNumber}
                    </h3>
                    <p style={styles.date}>
                      {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <span style={styles.statusBadge}>
                    {order.status}
                  </span>
                </div>

                <div style={styles.items}>
                  {(order.items || []).map((item, index) => (
                    <div key={`${item.name}-${index}`} style={styles.itemRow}>
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                      <strong>
                        ₹
                        {(
                          Number(item.price || 0) *
                          Number(item.quantity || 0)
                        ).toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div style={styles.totalRow}>
                  <span>Total</span>
                  <strong>
                    ₹{Number(order.total || 0).toFixed(2)}
                  </strong>
                </div>

                <div style={styles.paymentBox}>
                  <div>
                    <span style={styles.muted}>Payment method</span>
                    <strong>{order.paymentMethod || "Not specified"}</strong>
                  </div>

                  <div>
                    <span style={styles.muted}>Payment timing</span>
                    <strong>
                      {order.paymentTiming || "After Order"}
                    </strong>
                  </div>

                  <div>
                    <span style={styles.muted}>Payment status</span>
                    <strong
                      style={{
                        color:
                          order.paymentStatus === "Paid"
                            ? "#16803d"
                            : "#b45309",
                      }}
                    >
                      {order.paymentStatus || "Pending"}
                    </strong>
                  </div>
                </div>

                {order.status !== "Cancelled" &&
                  order.status !== "Served" && (
                    <div style={styles.controls}>
                      <label style={styles.label}>
                        Update order status
                        <select
                          style={styles.select}
                          value={order.status}
                          disabled={busyOrderId === order._id}
                          onChange={(event) =>
                            changeStatus(order, event.target.value)
                          }
                        >
                          {order.status === "New" && (
                            <option value="New">New</option>
                          )}
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>

                      {order.paymentStatus !== "Paid" && (
                        <button
                          type="button"
                          style={styles.paymentButton}
                          disabled={busyOrderId === order._id}
                          onClick={() => confirmPayment(order)}
                        >
                          Confirm Payment
                        </button>
                      )}

                      <button
                        type="button"
                        style={styles.cancelButton}
                        disabled={busyOrderId === order._id}
                        onClick={() => cancelOrder(order)}
                      >
                        Cancel Order
                      </button>
                    </div>
                  )}

                {busyOrderId === order._id && (
                  <p style={styles.muted}>Updating order...</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={styles.completedSection}>
        <h2 style={styles.sectionTitle}>Completed & Cancelled Orders</h2>

        {completedOrders.length === 0 ? (
          <p style={styles.message}>No completed or cancelled orders yet.</p>
        ) : (
          <div style={styles.orderGrid}>
            {completedOrders.map((order) => (
              <article key={order._id} style={styles.orderCard}>
                <div style={styles.orderHeader}>
                  <div>
                    <span style={styles.orderNumber}>
                      Order #{String(order._id).slice(-6).toUpperCase()}
                    </span>
                    <h3 style={styles.tableTitle}>
                      Table {order.tableNumber}
                    </h3>
                    <p style={styles.date}>
                      {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <span style={styles.statusBadge}>{order.status}</span>
                </div>

                <p>
                  Total: <strong>₹{Number(order.total || 0).toFixed(2)}</strong>
                </p>

                <p>
                  Payment: {order.paymentStatus || "Pending"} (
                  {order.paymentMethod || "Not specified"})
                </p>

                {order.cancellationReason && (
                  <p style={styles.error}>
                    Reason: {order.cancellationReason}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "32px",
    background: "#f5f7fb",
    color: "#172033",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    marginBottom: "28px",
  },
  eyebrow: {
    color: "#39805a",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "1px",
  },
  title: { fontSize: "32px", margin: "8px 0" },
  subtitle: { color: "#687386", fontSize: "14px", lineHeight: 1.6 },
  headerButtons: { display: "flex", flexWrap: "wrap", gap: "10px" },
  primaryButton: {
    padding: "12px 18px",
    border: 0,
    borderRadius: "9px",
    background: "#39805a",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "12px 18px",
    border: "1px solid #d5dbea",
    borderRadius: "9px",
    background: "#fff",
    color: "#172033",
    cursor: "pointer",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "32px",
  },
  statCard: {
    padding: "22px",
    border: "1px solid #e5e9f2",
    borderRadius: "14px",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    color: "#687386",
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "18px",
  },
  sectionTitle: { fontSize: "22px", marginBottom: "6px" },
  liveBadge: {
    color: "#16803d",
    background: "#dcfce7",
    borderRadius: "20px",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: 700,
  },
  orderGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
    gap: "18px",
  },
  orderCard: {
    background: "#fff",
    border: "1px solid #e3e8f2",
    borderRadius: "14px",
    padding: "20px",
    minWidth: 0,
  },
  orderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },
  orderNumber: {
    fontSize: "12px",
    color: "#687386",
    fontWeight: 700,
  },
  tableTitle: { fontSize: "21px", margin: "8px 0" },
  date: { color: "#687386", fontSize: "12px" },
  statusBadge: {
    background: "#eef2ff",
    color: "#4338ca",
    borderRadius: "8px",
    padding: "7px 9px",
    fontSize: "12px",
    fontWeight: 700,
  },
  items: {
    borderTop: "1px solid #edf0f6",
    borderBottom: "1px solid #edf0f6",
    marginTop: "15px",
    padding: "12px 0",
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "7px 0",
    fontSize: "14px",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "14px 0",
    fontSize: "17px",
  },
  paymentBox: {
    display: "grid",
    gap: "12px",
    background: "#f8fafc",
    borderRadius: "10px",
    padding: "14px",
  },
  muted: { display: "block", color: "#687386", fontSize: "12px", marginBottom: "5px" },
  controls: { display: "grid", gap: "10px", marginTop: "16px" },
  label: { fontSize: "13px", fontWeight: 700 },
  select: {
    display: "block",
    width: "100%",
    marginTop: "8px",
    padding: "11px",
    border: "1px solid #d5dbea",
    borderRadius: "8px",
    background: "#fff",
  },
  paymentButton: {
    padding: "11px",
    border: 0,
    borderRadius: "8px",
    background: "#15803d",
    color: "#fff",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "11px",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    background: "#fff1f2",
    color: "#b91c1c",
    cursor: "pointer",
  },
  empty: {
    padding: "36px 20px",
    background: "#fff",
    border: "1px dashed #ccd4e4",
    borderRadius: "14px",
    textAlign: "center",
  },
  message: { color: "#687386", padding: "18px 0" },
  completedSection: { marginTop: "38px" },
  error: {
    background: "#fff1f2",
    color: "#b91c1c",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  notice: {
    background: "#dcfce7",
    color: "#166534",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
};
