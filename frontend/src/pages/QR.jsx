
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import JSZip from "jszip";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com"
).replace(/\/+$/, "");

function getToken() {
  return (
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

export default function QR() {
  const [count, setCount] = useState("10");
  const [tables, setTables] = useState([]);
  const [qrImages, setQrImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const token = getToken();

    if (!token) {
      throw new Error("Please log in again to manage your tables.");
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }, []);

  const createQRImages = useCallback(async (savedTables) => {
    const entries = await Promise.all(
      savedTables.map(async (table) => {
        const image = await QRCode.toDataURL(table.qrUrl, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: "H",
          color: {
            dark: "#111827",
            light: "#FFFFFF",
          },
        });

        return [String(table.tableNumber), image];
      })
    );

    setQrImages(Object.fromEntries(entries));
  }, []);

  const loadTables = useCallback(async () => {
    setError("");
    setLoading(true);

    try {
      const data = await request("/tables");
      const savedTables = data.tables || [];

      setTables(savedTables);
      setCount(String(savedTables.length || 10));
      await createQRImages(savedTables);
    } catch (err) {
      setError(err.message || "Unable to load your tables.");
    } finally {
      setLoading(false);
    }
  }, [request, createQRImages]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  async function generateTables(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const number = Number(count);

    if (!Number.isInteger(number) || number < 1 || number > 200) {
      setError("Enter a whole number between 1 and 200.");
      return;
    }

    setSaving(true);

    try {
      const data = await request("/tables", {
        method: "POST",
        body: JSON.stringify({ count: number }),
      });

      const savedTables = data.tables || [];

      setTables(savedTables);
      await createQRImages(savedTables);
      setMessage(
        `${savedTables.length} table(s) loaded from your saved restaurant tables.`
      );
    } catch (err) {
      setError(err.message || "Unable to save tables.");
    } finally {
      setSaving(false);
    }
  }

  function downloadQR(tableNumber) {
    const image = qrImages[String(tableNumber)];
    if (!image) return;

    const link = document.createElement("a");
    link.href = image;
    link.download = `SmartServerHub-Table-${tableNumber}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function downloadAllQRs() {
    if (!tables.length) return;

    setError("");
    setDownloading(true);

    try {
      const zip = new JSZip();

      tables.forEach((table) => {
        const image = qrImages[String(table.tableNumber)];

        if (image) {
          zip.file(
            `Table-${table.tableNumber}.png`,
            image.split(",")[1],
            { base64: true }
          );
        }
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "SmartServerHub-Table-QR-Codes.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Unable to download QR codes. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      padding: "28px",
      background: "#f5f7fb",
      color: "#172033",
      fontFamily: "Arial, sans-serif",
    },
    container: {
      maxWidth: "1100px",
      margin: "0 auto",
    },
    panel: {
      background: "#fff",
      border: "1px solid #e3e8f0",
      borderRadius: "16px",
      padding: "24px",
      marginBottom: "24px",
      boxShadow: "0 5px 20px rgba(20, 35, 60, 0.04)",
    },
    input: {
      width: "100%",
      maxWidth: "280px",
      padding: "12px",
      border: "1px solid #ccd4e0",
      borderRadius: "8px",
      fontSize: "16px",
      boxSizing: "border-box",
    },
    button: {
      padding: "12px 18px",
      background: "#39805a",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "bold",
      cursor: "pointer",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
      gap: "18px",
    },
    card: {
      background: "#fff",
      border: "1px solid #e3e8f0",
      borderRadius: "14px",
      padding: "20px",
      textAlign: "center",
      minWidth: 0,
    },
    qr: {
      width: "100%",
      maxWidth: "220px",
      height: "auto",
      display: "block",
      margin: "12px auto",
    },
    link: {
      display: "block",
      fontSize: "12px",
      color: "#526078",
      overflowWrap: "anywhere",
      margin: "12px 0",
    },
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1>Table Management</h1>
        <p style={{ color: "#64748b", lineHeight: 1.6 }}>
          Set up your restaurant tables, generate customer QR codes, and
          download them to print and place on your tables.
        </p>

        <section style={styles.panel}>
          <h2>Generate Table QR Codes</h2>

          <form
            onSubmit={generateTables}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: "8px" }}>
              <span>Number of tables (1–200)</span>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="200"
                step="1"
                value={count}
                onChange={(event) => setCount(event.target.value)}
                required
              />
            </label>

            <button style={styles.button} type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save & Generate QR Codes"}
            </button>
          </form>

          <p style={{ fontSize: "13px", color: "#64748b" }}>
            Saving a higher table count adds missing table numbers. Existing
            tables are retained.
          </p>

          {error && (
            <p role="alert" style={{ color: "#c62828" }}>
              {error}
            </p>
          )}

          {message && (
            <p role="status" style={{ color: "#167447" }}>
              {message}
            </p>
          )}
        </section>

        <section>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <h2>Your Tables ({tables.length})</h2>

            <button
              style={{
                ...styles.button,
                background: "#172033",
              }}
              type="button"
              onClick={downloadAllQRs}
              disabled={!tables.length || downloading}
            >
              {downloading ? "Preparing ZIP..." : "Download All QR Codes"}
            </button>
          </div>

          {loading ? (
            <p>Loading your saved tables...</p>
          ) : tables.length === 0 ? (
            <section style={styles.panel}>
              No tables saved yet. Enter your table count above to get started.
            </section>
          ) : (
            <div style={styles.grid}>
              {tables.map((table) => (
                <article key={table.id || table.tableNumber} style={styles.card}>
                  <h3>Table {table.tableNumber}</h3>

                  {qrImages[String(table.tableNumber)] ? (
                    <img
                      style={styles.qr}
                      src={qrImages[String(table.tableNumber)]}
                      alt={`QR code for Table ${table.tableNumber}`}
                    />
                  ) : (
                    <p>Preparing QR code...</p>
                  )}

                  <p style={{ fontSize: "13px" }}>
                    Scan to open this table's customer menu.
                  </p>

                  <a
                    style={styles.link}
                    href={table.qrUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview customer menu link
                  </a>

                  <button
                    style={styles.button}
                    type="button"
                    onClick={() => downloadQR(table.tableNumber)}
                    disabled={!qrImages[String(table.tableNumber)]}
                  >
                    Download Table {table.tableNumber}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
