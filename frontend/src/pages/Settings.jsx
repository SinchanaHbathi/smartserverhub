

import { useEffect, useState } from "react";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com/api"
).replace(/\/+$/, "");

function getToken() {
  return (
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

export default function Settings() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);

  // Payment settings
  const [upiId, setUpiId] = useState("");
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [paymentQrFile, setPaymentQrFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
const [showNewPassword, setShowNewPassword] = useState(false);
const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sales report
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState(null);

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }

  // Load saved restaurant settings
  useEffect(() => {
    let active = true;

    apiRequest("/settings")
      .then((data) => {
        if (!active) return;

        setUpiId(data.upiId || "");
        setPaymentQrUrl(data.paymentQrUrl || "");
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Create and clean up the selected image preview URL
  useEffect(() => {
    if (!paymentQrFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(paymentQrFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentQrFile]);

  function handleQrFileChange(event) {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setPaymentQrFile(null);
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Please upload a PNG, JPG, or WEBP image.");
      event.target.value = "";
      setPaymentQrFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Payment QR image must be smaller than 5 MB.");
      event.target.value = "";
      setPaymentQrFile(null);
      return;
    }

    setMessage("");
    setPaymentQrFile(file);
  }

  function removeSelectedQr() {
    setPaymentQrFile(null);

    const fileInput = document.getElementById("paymentQrFile");
    if (fileInput) fileInput.value = "";
  }

  // Save UPI ID and uploaded QR image
  async function savePaymentSettings(event) {
    event.preventDefault();
    setMessage("");
    setSavingPayment(true);

    try {
      const formData = new FormData();
      formData.append("upiId", upiId.trim());

      if (paymentQrFile) {
        formData.append("paymentQr", paymentQrFile);
      } else if (paymentQrUrl.trim()) {
        // Retain support for an existing hosted QR image URL.
        formData.append("paymentQrUrl", paymentQrUrl.trim());
      }

      const response = await fetch(`${API_URL}/settings`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to save payment settings."
        );
      }

      setUpiId(data.upiId ?? upiId);
      setPaymentQrUrl(data.paymentQrUrl || paymentQrUrl);
      setPaymentQrFile(null);

      setMessage("UPI ID and payment QR saved successfully.");
    } catch (error) {
      setMessage(error.message || "Unable to save payment settings.");
    } finally {
      setSavingPayment(false);
    }
  }

  // Change restaurant account password
  async function changePassword(event) {
    event.preventDefault();
    setMessage("");

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      return;
    }

    try {
      const data = await apiRequest("/auth/change-password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      setMessage(data.message || "Password changed successfully.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  // Generate sales report
  async function loadSalesReport(event) {
    event.preventDefault();
    setMessage("");
    setReport(null);

    if (startDate && endDate && startDate > endDate) {
      setMessage("Start date cannot be after the end date.");
      return;
    }

    try {
      const params = new URLSearchParams();

      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);

      const data = await apiRequest(
        `/reports/sales?${params.toString()}`
      );

      setReport(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (loading) {
    return <main style={styles.page}>Loading settings...</main>;
  }

  return (
    <main style={styles.page}>
      <h1>Restaurant Settings</h1>

      <p style={styles.subtitle}>
        Manage your payment QR, sales reports, and account password.
      </p>

      {message && (
        <div role="status" style={styles.message}>
          {message}
        </div>
      )}

      {/* PAYMENT SETTINGS */}
      <section style={styles.card}>
        <h2>UPI &amp; Payment QR</h2>

        <form onSubmit={savePaymentSettings}>
          <label style={styles.label} htmlFor="restaurantUpiId">
            Restaurant UPI ID
          </label>

          <input
            id="restaurantUpiId"
            style={styles.input}
            type="text"
            value={upiId}
            onChange={(event) => setUpiId(event.target.value)}
            placeholder="restaurant@upi"
            maxLength={150}
          />

          <label style={styles.label} htmlFor="paymentQrFile">
            Upload Payment QR Image
          </label>

          <input
            id="paymentQrFile"
            style={styles.input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleQrFileChange}
          />

          <p style={styles.hint}>
            Upload your restaurant's UPI QR code as a PNG, JPG, or WEBP
            image. Maximum file size: 5 MB.
          </p>

          {paymentQrFile && previewUrl && (
            <div style={styles.qrSection}>
              <h3>Selected QR Preview</h3>

              <img
                src={previewUrl}
                alt="Selected restaurant payment QR"
                style={styles.qr}
              />

              <p style={styles.fileName}>{paymentQrFile.name}</p>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={removeSelectedQr}
              >
                Remove Selected Image
              </button>
            </div>
          )}

          {!paymentQrFile && paymentQrUrl && (
            <div style={styles.qrSection}>
              <h3>Currently Saved Payment QR</h3>

              <img
                src={paymentQrUrl}
                alt="Saved restaurant payment QR"
                style={styles.qr}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}

          <button
            style={{
              ...styles.button,
              opacity: savingPayment ? 0.7 : 1,
            }}
            type="submit"
            disabled={savingPayment}
          >
            {savingPayment ? "Saving..." : "Save Payment Settings"}
          </button>
        </form>
      </section>

      {/* SALES REPORT */}
      <section style={styles.card}>
        <h2>Sales Report</h2>

        <form onSubmit={loadSalesReport}>
          <label style={styles.label} htmlFor="startDate">
            Start Date
          </label>

          <input
            id="startDate"
            style={styles.input}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />

          <label style={styles.label} htmlFor="endDate">
            End Date
          </label>

          <input
            id="endDate"
            style={styles.input}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />

          <button style={styles.button} type="submit">
            Generate Report
          </button>
        </form>

        {report && (
          <div style={styles.reportGrid}>
            <ReportCard
              title="Total Orders"
              value={report.totalOrders ?? 0}
            />

            <ReportCard
              title="Paid Orders"
              value={report.paidOrders ?? 0}
            />

            <ReportCard
              title="Pending Orders"
              value={report.pendingOrders ?? 0}
            />

            <ReportCard
              title="Paid Sales"
              value={`₹${Number(report.totalSales || 0).toFixed(2)}`}
            />

            <ReportCard
              title="Pending Amount"
              value={`₹${Number(report.pendingAmount || 0).toFixed(2)}`}
            />
          </div>
        )}

        {report?.dailySales?.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 20 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.cell}>Date</th>
                  <th style={styles.cell}>Paid Sales</th>
                  <th style={styles.cell}>Paid Orders</th>
                </tr>
              </thead>

              <tbody>
                {report.dailySales.map((day) => (
                  <tr key={day._id}>
                    <td style={styles.cell}>{day._id}</td>
                    <td style={styles.cell}>
                      ₹{Number(day.sales || 0).toFixed(2)}
                    </td>
                    <td style={styles.cell}>{day.orders ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CHANGE PASSWORD */}
      <section style={styles.card}>
        <h2>Change Password</h2>

        <form onSubmit={changePassword}>
          <label style={styles.label} htmlFor="currentPassword">
            Current Password
          </label>
<div style={{ display: "flex", gap: "8px" }}>
  <input
    id="currentPassword"
    type={showCurrentPassword ? "text" : "password"}
    value={currentPassword}
    onChange={(e) => setCurrentPassword(e.target.value)}
    autoComplete="current-password"
    required
    style={{ ...styles.input, flex: 1, minWidth: 0 }}
  />

  <button
    type="button"
    onClick={() => setShowCurrentPassword((v) => !v)}
  >
    {showCurrentPassword ? "Hide" : "Show"}
  </button>
</div>

          <label style={styles.label} htmlFor="newPassword">
            New Password
          </label>

          <div style={{ display: "flex", gap: "8px" }}>
  <input
    id="newPassword"
    type={showNewPassword ? "text" : "password"}
    value={newPassword}
    onChange={(e) => setNewPassword(e.target.value)}
    autoComplete="new-password"
    minLength={8}
    maxLength={128}
    required
    style={{ ...styles.input, flex: 1, minWidth: 0 }}
  />

  <button
    type="button"
    onClick={() => setShowNewPassword((v) => !v)}
  >
    {showNewPassword ? "Hide" : "Show"}
  </button>
</div>

          <label style={styles.label} htmlFor="confirmPassword">
            Confirm New Password
          </label>

          <div style={{ display: "flex", gap: "8px" }}>
  <input
    id="confirmPassword"
    type={showConfirmPassword ? "text" : "password"}
    value={confirmPassword}
    onChange={(e) => setConfirmPassword(e.target.value)}
    autoComplete="new-password"
    minLength={8}
    maxLength={128}
    required
    style={{ ...styles.input, flex: 1, minWidth: 0 }}
  />

  <button
    type="button"
    onClick={() => setShowConfirmPassword((v) => !v)}
  >
    {showConfirmPassword ? "Hide" : "Show"}
  </button>
</div>

          <button style={styles.button} type="submit">
            Update Password
          </button>
        </form>
      </section>
    </main>
  );
}

function ReportCard({ title, value }) {
  return (
    <div style={styles.reportCard}>
      <p style={styles.reportTitle}>{title}</p>
      <h3>{value}</h3>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: 24,
    color: "#17231d",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
  },

  subtitle: {
    color: "#66736b",
    marginBottom: 24,
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e1e7e2",
    borderRadius: 14,
    padding: 22,
    marginBottom: 22,
    boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
    boxSizing: "border-box",
  },

  label: {
    display: "block",
    marginTop: 14,
    marginBottom: 7,
    fontWeight: 600,
  },

  input: {
    boxSizing: "border-box",
    width: "100%",
    padding: 12,
    border: "1px solid #ccd5ce",
    borderRadius: 8,
    fontSize: 15,
    background: "#ffffff",
  },

  hint: {
    color: "#66736b",
    fontSize: 13,
    lineHeight: 1.5,
  },

  button: {
    marginTop: 18,
    padding: "12px 18px",
    background: "#176b45",
    color: "#ffffff",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },

  secondaryButton: {
    marginTop: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#176b45",
    border: "1px solid #176b45",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },

  message: {
    padding: 12,
    background: "#edf6ef",
    color: "#244d35",
    borderRadius: 8,
    marginBottom: 18,
    overflowWrap: "anywhere",
  },

  qrSection: {
    margin: "18px 0",
    padding: 16,
    background: "#f7faf8",
    border: "1px solid #e1e7e2",
    borderRadius: 10,
  },

  qr: {
    display: "block",
    width: 200,
    maxWidth: "100%",
    maxHeight: 260,
    objectFit: "contain",
    marginTop: 10,
  },

  fileName: {
    color: "#66736b",
    fontSize: 13,
    overflowWrap: "anywhere",
  },

  reportGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginTop: 22,
  },

  reportCard: {
    background: "#f4f8f5",
    borderRadius: 10,
    padding: 16,
    overflowWrap: "anywhere",
  },

  reportTitle: {
    color: "#66736b",
    margin: 0,
    fontSize: 14,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },

  cell: {
    padding: 10,
    borderBottom: "1px solid #e1e7e2",
  },
};
