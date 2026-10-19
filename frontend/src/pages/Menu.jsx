

import { useCallback, useEffect, useMemo, useState } from "react";
import "./Menu.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com"
).replace(/\/+$/, "");

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  marginTop: "6px",
  fontSize: "14px",
};

const primaryButtonStyle = {
  padding: "10px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#287b48",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};

const secondaryButtonStyle = {
  padding: "9px 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
  fontWeight: 500,
};

function getToken() {
  return (
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    ...item,
    name: item.name || "",
    category: item.category || "Other",
    price: item.price ?? "",
    available: item.available !== false,
  }));
}

function cleanItems(items) {
  return items.map((item) => ({
    name: String(item.name || "").trim(),
    category: String(item.category || "").trim(),
    price: Number(item.price),
    available: item.available !== false,
  }));
}

export default function Menu() {
  const [mode, setMode] = useState("manual");

  const [manualCategories, setManualCategories] = useState([""]);
  const [manualItems, setManualItems] = useState([]);

  const [uploadedCategories, setUploadedCategories] = useState([]);
  const [uploadedItems, setUploadedItems] = useState([]);

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [publishMode, setPublishMode] = useState("both");
  const [hasScanned, setHasScanned] = useState(false);

  const manualCategoryPaths = useMemo(
    () => unique(manualCategories),
    [manualCategories]
  );

  const uploadedCategoryPaths = useMemo(
    () => unique(uploadedCategories),
    [uploadedCategories]
  );

  const request = useCallback(async (path, options = {}) => {
    const token = getToken();

    if (!token) {
      throw new Error("Please log in again to manage your menu.");
    }

    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong.");
    }

    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        setLoading(true);
        setError("");

        const data = await request("/menu");

        if (cancelled) return;

        // Prefer the separate menu data. Fall back to the existing published
        // menu for restaurants that were created before this change.
        const savedManualItems = normalizeItems(
          Array.isArray(data.manualItems) ? data.manualItems : data.items || []
        );

        const savedUploadedItems = normalizeItems(data.uploadedItems || []);

        const savedManualCategories = unique([
          ...(data.manualCategories || []),
          ...savedManualItems.map((item) => item.category),
        ]);

        const savedUploadedCategories = unique([
          ...(data.uploadedCategories || []),
          ...savedUploadedItems.map((item) => item.category),
        ]);

        setManualItems(savedManualItems);
        setUploadedItems(savedUploadedItems);

        setManualCategories(
          savedManualCategories.length ? savedManualCategories : [""]
        );

        setUploadedCategories(savedUploadedCategories);
        setPublishMode(
          ["both", "manual", "uploaded"].includes(data.publishMode)
            ? data.publishMode
            : "manual"
        );
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMenu();

    return () => {
      cancelled = true;
    };
  }, [request]);

  function updateCategory(setter, index, value) {
    setter((previous) =>
      previous.map((category, i) => (i === index ? value : category))
    );
    setMessage("");
  }

  function addCategory(setter) {
    setter((previous) => [...previous, ""]);
    setError("");
    setMessage("");
  }

  function removeCategory(setter, itemSetter, categories, index) {
    const removedCategory = categories[index];

    setter((previous) => previous.filter((_, i) => i !== index));

    if (removedCategory) {
      itemSetter((previous) =>
        previous.filter((item) => item.category !== removedCategory)
      );
    }

    setMessage("");
  }

  function addItem(setter, category) {
    if (!category) {
      setError("Please enter a category name before adding food.");
      return;
    }

    setter((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: "",
        category,
        price: "",
        available: true,
      },
    ]);

    setError("");
    setMessage("");
  }

  function updateItem(setter, index, field, value) {
    setter((previous) =>
      previous.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
    setMessage("");
  }

  function removeItem(setter, index) {
    setter((previous) => previous.filter((_, i) => i !== index));
    setMessage("");
  }

  async function scanImages(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!images.length) {
      setError("Choose at least one menu photo to scan.");
      return;
    }

    const formData = new FormData();
    images.forEach((file) => formData.append("images", file));

    setScanning(true);

    try {
      const data = await request("/menu/scan", {
        method: "POST",
        body: formData,
      });

      const scannedItems = normalizeItems(data.items || []);
      const categories = unique([
        ...(data.categories || []),
        ...scannedItems.map((item) => item.category),
      ]);

      // Important: scanned items only update the uploaded menu.
      // Manual items and manual categories are not changed.
      setUploadedItems(scannedItems);
      setUploadedCategories(categories.length ? categories : ["Other"]);
      setHasScanned(true);

      setMessage(
        `Scan complete. Found ${scannedItems.length} items. Review them below before saving.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  function validateMenu(categories, items, label) {
    const validCategories = unique(categories);
    const cleanedItems = cleanItems(items);

    if (!cleanedItems.length) {
      return {
        error: `${label}: Add at least one food item before saving.`,
      };
    }

    const invalidItem = cleanedItems.find(
      (item) =>
        !item.name ||
        !item.category ||
        !validCategories.includes(item.category) ||
        !Number.isFinite(item.price) ||
        item.price < 0
    );

    if (invalidItem) {
      return {
        error: `${label}: Check every food name, category and price. Each item must belong to a listed category and have a valid price.`,
      };
    }

    return {
      categories: validCategories,
      items: cleanedItems,
    };
  }

  async function saveMenu(selectedMode = publishMode) {
    setError("");
    setMessage("");

    if (!["both", "manual", "uploaded"].includes(selectedMode)) {
      setError("Choose which menu you want to save.");
      return;
    }

    const manualResult =
      selectedMode === "uploaded"
        ? { categories: unique(manualCategories), items: cleanItems(manualItems) }
        : validateMenu(manualCategories, manualItems, "Manual menu");

    if (manualResult.error && selectedMode !== "uploaded") {
      setError(manualResult.error);
      return;
    }

    const uploadedResult =
      selectedMode === "manual"
        ? {
            categories: unique(uploadedCategories),
            items: cleanItems(uploadedItems),
          }
        : validateMenu(
            uploadedCategories,
            uploadedItems,
            "Uploaded menu"
          );

    if (uploadedResult.error && selectedMode !== "manual") {
      setError(uploadedResult.error);
      return;
    }

    // For a menu that is not selected for publishing, preserve its stored
    // data, even if it is currently empty.
    const finalManualCategories = unique(manualCategories);
    const finalManualItems = cleanItems(manualItems);
    const finalUploadedCategories = unique(uploadedCategories);
    const finalUploadedItems = cleanItems(uploadedItems);

    const publishedCategories = unique([
      ...(selectedMode === "both" || selectedMode === "manual"
        ? finalManualCategories
        : []),
      ...(selectedMode === "both" || selectedMode === "uploaded"
        ? finalUploadedCategories
        : []),
    ]);

    const publishedItems = [
      ...(selectedMode === "both" || selectedMode === "manual"
        ? finalManualItems
        : []),
      ...(selectedMode === "both" || selectedMode === "uploaded"
        ? finalUploadedItems
        : []),
    ];

    if (!publishedItems.length) {
      setError("The selected menu is empty. Add or scan some food items first.");
      return;
    }

    setSaving(true);

    try {
      await request("/menu", {
        method: "PUT",
        body: JSON.stringify({
          manualCategories: finalManualCategories,
          manualItems: finalManualItems,
          uploadedCategories: finalUploadedCategories,
          uploadedItems: finalUploadedItems,
          publishMode: selectedMode,

          // Keep the published fields for existing customer QR menu pages.
          categories: publishedCategories,
          items: publishedItems,
        }),
      });

      setPublishMode(selectedMode);
      setHasScanned(false);

      const label =
        selectedMode === "both"
          ? "Both menus"
          : selectedMode === "manual"
            ? "Manual menu"
            : "Uploaded menu";

      setMessage(`${label} saved successfully.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderItems(items, setter, categories, label) {
    return (
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {!items.length && (
          <p style={{ color: "#6b7280" }}>
            No {label.toLowerCase()} items yet. Add a food item below.
          </p>
        )}

        {items.map((item, index) => (
          <div
            key={item.id || item._id || `${label}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(150px, 2fr) minmax(140px, 1.5fr) minmax(100px, 1fr) auto auto",
              gap: 10,
              alignItems: "end",
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
            }}
          >
            <label>
              Food name
              <input
                style={inputStyle}
                value={item.name}
                maxLength={150}
                placeholder="e.g. Masala Dosa"
                onChange={(event) =>
                  updateItem(setter, index, "name", event.target.value)
                }
              />
              {item.needsReview && (
                <small style={{ color: "#b45309" }}>
                  Please check this scanned item.
                </small>
              )}
            </label>

            <label>
              Category
              <select
                style={inputStyle}
                value={item.category}
                onChange={(event) =>
                  updateItem(setter, index, "category", event.target.value)
                }
              >
                {!categories.includes(item.category) && (
                  <option value={item.category}>{item.category}</option>
                )}
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Price (₹)
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                placeholder="Price"
                onChange={(event) =>
                  updateItem(setter, index, "price", event.target.value)
                }
              />
            </label>

            <label style={{ padding: "10px 0", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={item.available !== false}
                onChange={(event) =>
                  updateItem(
                    setter,
                    index,
                    "available",
                    event.target.checked
                  )
                }
              />{" "}
              Available
            </label>

            <button
              type="button"
              style={{ ...secondaryButtonStyle, color: "#b91c1c" }}
              onClick={() => removeItem(setter, index)}
            >
              Remove
            </button>
          </div>
        ))}

        {categories.length > 0 && (
          <div>
            <label>
              Add item to category{" "}
              <select
                id={`${label.replace(/\s/g, "-")}-new-category`}
                style={{ ...inputStyle, maxWidth: 300 }}
                defaultValue={categories[0]}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              style={{ ...secondaryButtonStyle, marginTop: 10 }}
              onClick={() => {
                const select = document.getElementById(
                  `${label.replace(/\s/g, "-")}-new-category`
                );
                addItem(setter, select?.value || categories[0]);
              }}
            >
              + Add Food Item
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderCategories(categories, setter, itemSetter, items, label) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {categories.map((category, index) => (
          <div
            key={`${label}-${index}`}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label style={{ flex: 1 }}>
              Category {index + 1}
              <input
                style={inputStyle}
                value={category}
                maxLength={100}
                placeholder="e.g. Soups, Rice, Snacks"
                onChange={(event) =>
                  updateCategory(setter, index, event.target.value)
                }
              />
            </label>

            <button
              type="button"
              style={{ ...secondaryButtonStyle, color: "#b91c1c" }}
              onClick={() =>
                removeCategory(setter, itemSetter, categories, index)
              }
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          style={{ ...secondaryButtonStyle, justifySelf: "start" }}
          onClick={() => addCategory(setter)}
        >
          + Add Category
        </button>

        <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
          {items.length} {label.toLowerCase()} food item(s)
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="menu-page">
        <p>Loading your saved menu...</p>
      </main>
    );
  }

  return (
    <main className="menu-page" style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      <header
        className="menu-page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <p className="menu-eyebrow">SMARTSERVERHUB / RESTAURANT</p>
          <h1>Menu Management</h1>
          <p className="menu-subtitle">
            Manage your manual menu and scanned menu separately.
          </p>
        </div>

        <button
          type="button"
          style={primaryButtonStyle}
          onClick={() => saveMenu()}
          disabled={saving || scanning}
        >
          {saving ? "Saving..." : "Save Selected Menu"}
        </button>
      </header>

      {message && (
        <div className="menu-notice success" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="menu-notice error" role="alert">
          {error}
        </div>
      )}

      <nav
        className="menu-mode-switch"
        aria-label="Menu editing options"
        style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}
      >
        <button
          type="button"
          style={mode === "manual" ? primaryButtonStyle : secondaryButtonStyle}
          onClick={() => {
            setMode("manual");
            setError("");
            setMessage("");
          }}
        >
          Manual Menu
        </button>

        <button
          type="button"
          style={mode === "uploaded" ? primaryButtonStyle : secondaryButtonStyle}
          onClick={() => {
            setMode("uploaded");
            setError("");
            setMessage("");
          }}
        >
          Upload / Scan Menu
        </button>
      </nav>

      {mode === "manual" && (
        <section className="menu-panel" style={{ marginBottom: 24 }}>
          <h2>Manual Menu</h2>
          <p className="menu-help">
            Enter your own categories and food items. These stay separate from
            the scanned menu.
          </p>

          {renderCategories(
            manualCategories,
            setManualCategories,
            setManualItems,
            manualItems,
            "Manual"
          )}

          <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

          <h3>Manual Food Items</h3>
          {renderItems(
            manualItems,
            setManualItems,
            manualCategoryPaths,
            "Manual Menu"
          )}
        </section>
      )}

      {mode === "uploaded" && (
        <>
          <section className="menu-panel" style={{ marginBottom: 24 }}>
            <h2>Upload Menu Photo</h2>
            <p className="menu-help">
              Choose menu photos and scan them. Scanned items are kept in the
              uploaded menu and do not overwrite your manual items.
            </p>

            <form onSubmit={scanImages}>
              <label style={{ display: "block", marginBottom: 12 }}>
                Menu photos
                <input
                  style={{ ...inputStyle, maxWidth: 600 }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  onChange={(event) =>
                    setImages(Array.from(event.target.files || []))
                  }
                />
              </label>

              {images.length > 0 && (
                <ul>
                  {images.map((file, index) => (
                    <li key={`${file.name}-${index}`}>{file.name}</li>
                  ))}
                </ul>
              )}

              <button
                type="submit"
                style={primaryButtonStyle}
                disabled={scanning || !images.length}
              >
                {scanning ? "Scanning..." : "Scan Menu"}
              </button>
            </form>

            {hasScanned && (
              <p className="menu-ai-reminder">
                Scan results are not saved yet. Review the categories, names
                and prices below, then choose a save option.
              </p>
            )}
          </section>

          <section className="menu-panel" style={{ marginBottom: 24 }}>
            <h2>Uploaded Menu Categories</h2>
            {renderCategories(
              uploadedCategories,
              setUploadedCategories,
              setUploadedItems,
              uploadedItems,
              "Uploaded"
            )}

            <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #e5e7eb" }} />

            <h3>Scanned Food Items</h3>
            {renderItems(
              uploadedItems,
              setUploadedItems,
              uploadedCategoryPaths,
              "Uploaded Menu"
            )}
          </section>
        </>
      )}

      <section
        className="menu-panel"
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
        }}
      >
        <h2>Choose Which Menu to Save</h2>
        <p className="menu-help">
          Your selected menu is published to the customer QR menu. The two
          source menus are stored separately.
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
            <input
              type="radio"
              name="publishMode"
              value="both"
              checked={publishMode === "both"}
              onChange={() => setPublishMode("both")}
            />
            <span>
              <strong>Save Both Menus</strong>
              <br />
              <small>Publish manual and uploaded food items together.</small>
            </span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
            <input
              type="radio"
              name="publishMode"
              value="manual"
              checked={publishMode === "manual"}
              onChange={() => setPublishMode("manual")}
            />
            <span>
              <strong>Save Only Manual Menu</strong>
              <br />
              <small>Publish only items entered manually.</small>
            </span>
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "start" }}>
            <input
              type="radio"
              name="publishMode"
              value="uploaded"
              checked={publishMode === "uploaded"}
              onChange={() => setPublishMode("uploaded")}
            />
            <span>
              <strong>Save Only Uploaded Menu</strong>
              <br />
              <small>Publish only items extracted from uploaded menus.</small>
            </span>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 22,
          }}
        >
          <span>
            Manual: {manualItems.length} items · Uploaded: {uploadedItems.length} items
          </span>

          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => saveMenu()}
            disabled={saving || scanning}
          >
            {saving ? "Saving..." : "Save Menu Choice"}
          </button>
        </div>
      </section>
    </main>
  );
}
