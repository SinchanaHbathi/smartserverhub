
import { useCallback, useEffect, useMemo, useState } from "react";
import "./CustomerMenu.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "https://smartserverhub.onrender.com"
).replace(/\/+$/, "");

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}

export default function CustomerMenu() {
  const params = new URLSearchParams(window.location.search);
  const restaurantId = params.get("restaurantId") || "";
  const tableNumber = Number(params.get("table") || 0);

  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [cart, setCart] = useState({});
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [order, setOrder] = useState(null);
  const [customerToken, setCustomerToken] = useState("");
  const [upiUrl, setUpiUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showCart, setShowCart] = useState(false);

  const storageKey = `smartserverhub_customer_order_${restaurantId}_${tableNumber}`;

  const loadMenu = useCallback(async () => {
    if (!restaurantId || !tableNumber || !Number.isInteger(tableNumber) || tableNumber < 1) {
      setError("This table QR code is invalid. Please scan the QR code again.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      const data = await apiRequest(
        `/menu/customer/${encodeURIComponent(restaurantId)}`
      );

      setRestaurantName(data.restaurantName || "Restaurant");
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // Restore the customer's active order after returning from a UPI app.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (parsed?.order?._id && parsed?.customerToken) {
        setOrder(parsed.order);
        setCustomerToken(parsed.customerToken);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const saveActiveOrder = useCallback(
    (nextOrder, nextToken) => {
      setOrder(nextOrder);
      setCustomerToken(nextToken);

      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ order: nextOrder, customerToken: nextToken })
        );
      } catch {
        // The current page can still work if session storage is unavailable.
      }
    },
    [storageKey]
  );

  const refreshOrder = useCallback(async () => {
    if (!order?._id || !customerToken) return;

    try {
      const data = await apiRequest(
        `/orders/${order._id}/customer-status`,
        { headers: { "x-customer-token": customerToken } }
      );

      setOrder(data.order);

      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ order: data.order, customerToken })
        );
      } catch {
        // Ignore storage errors.
      }
    } catch {
      // Avoid interrupting the customer's page for a temporary network issue.
    }
  }, [order?._id, customerToken, storageKey]);

  useEffect(() => {
    if (!order?._id || !customerToken) return;

    const timer = window.setInterval(refreshOrder, 4000);
    return () => window.clearInterval(timer);
  }, [order?._id, customerToken, refreshOrder]);

  const visibleItems = useMemo(() => {
    if (activeCategory === "All") return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const cartItems = useMemo(
    () =>
      items
        .filter((item) => Number(cart[item._id] || 0) > 0)
        .map((item) => ({
          ...item,
          quantity: Number(cart[item._id]),
        })),
    [items, cart]
  );

  const cartTotal = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  function changeQuantity(item, difference) {
    setCart((previous) => {
      const nextQuantity = Math.max(
        0,
        Number(previous[item._id] || 0) + difference
      );
      const next = { ...previous };

      if (nextQuantity === 0) {
        delete next[item._id];
      } else {
        next[item._id] = nextQuantity;
      }

      return next;
    });
  }

  async function placeOrder() {
    if (placingOrder) return;

    if (cartItems.length === 0) {
      setError("Please add at least one item to your cart.");
      return;
    }

    setPlacingOrder(true);
    setError("");
    setMessage("");
    setUpiUrl("");

    try {
      const data = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          restaurantId,
          tableNumber,
          paymentMethod,
          items: cartItems.map((item) => ({
            menuItemId: item._id,
            quantity: item.quantity,
          })),
        }),
      });

      if (!data.order || !data.customerToken) {
        throw new Error("The order was created, but its tracking details were not returned. Please contact the restaurant manager.");
      }

      saveActiveOrder(data.order, data.customerToken);
      setCart({});
      setShowCart(false);

      if (paymentMethod === "Cash") {
        setMessage("Order placed! Please pay at the counter. The manager will confirm your payment.");
        return;
      }

      const payment = await apiRequest(
        `/orders/${data.order._id}/start-payment`,
        {
          method: "POST",
          headers: { "x-customer-token": data.customerToken },
        }
      );

      if (payment.order) saveActiveOrder(payment.order, data.customerToken);
      if (payment.upiUrl) {
        setUpiUrl(payment.upiUrl);
        setMessage("Your order is placed. Open your UPI app to pay, then return here and tap “I've paid”.");
      } else {
        setMessage("Your order is placed. Please follow the payment instructions below.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  
async function openUpiApp() {
  if (!order?._id || !customerToken) return;

  if (upiUrl) {
    window.location.href = upiUrl;
    return;
  }

  if (order.status === "rejected") {
    try {
      const payment = await apiRequest(
        `/orders/${order._id}/retry-payment`,
        {
          method: "POST",
          headers: { "x-customer-token": customerToken },
        }
      );

      if (payment.order) {
        saveActiveOrder(payment.order, customerToken);
      }

      if (payment.upiUrl) {
        setUpiUrl(payment.upiUrl);
        window.location.href = payment.upiUrl;
      }
    } catch (err) {
      setError(err.message);
    }

    return;
  }

  setError(
    "The payment link is unavailable. If you already paid, tap “I've paid”. Otherwise, please ask the manager for assistance before retrying."
  );
}


  async function claimPayment() {
    if (!order?._id || !customerToken) return;

    setError("");
    setMessage("");

    try {
      const data = await apiRequest(
        `/orders/${order._id}/claim-payment`,
        {
          method: "POST",
          headers: { "x-customer-token": customerToken },
        }
      );

      if (data.order) saveActiveOrder(data.order, customerToken);
      setMessage("Payment claim sent to the manager. Your payment will be confirmed after they check it.");
    } catch (err) {
      setError(err.message);
    }
  }

  function startNewOrder() {
    setOrder(null);
    setCustomerToken("");
    setUpiUrl("");
    setMessage("");
    setError("");

    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors.
    }
  }

  const paymentStatus = order?.paymentStatus;
  const orderCancelled = order?.status === "cancelled";
  const paymentConfirmed = paymentStatus === "confirmed";
  const canClaimPayment =
    order?.paymentMethod === "UPI" &&
    order?.status === "payment_pending" &&
    paymentStatus === "pending";

  return (
    <main className="customer-page">
      <header className="customer-header">
        <div>
          <p className="customer-eyebrow">SMARTSERVERHUB</p>
          <h1>{restaurantName}</h1>
          <p className="customer-table">Table {tableNumber || "—"}</p>
        </div>
        <button
          className="customer-cart-button"
          onClick={() => setShowCart((value) => !value)}
          type="button"
        >
          Cart ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})
        </button>
      </header>

      {error && <div className="customer-alert customer-alert-error">{error}</div>}
      {message && <div className="customer-alert customer-alert-info">{message}</div>}

      {loading ? (
        <div className="customer-empty">Loading menu…</div>
      ) : error && items.length === 0 ? (
        <div className="customer-empty">
          <h2>Menu unavailable</h2>
          <p>Check your QR code or try again.</p>
          <button className="customer-primary-button" onClick={loadMenu} type="button">
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="customer-welcome">
            <h2>What would you like to eat?</h2>
            <p>Choose your favourites and place your order from your table.</p>
          </section>

          <nav className="customer-categories" aria-label="Menu categories">
            {["All", ...categories.filter((category) => category !== "All")].map(
              (category) => (
                <button
                  type="button"
                  key={category}
                  className={activeCategory === category ? "active" : ""}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              )
            )}
          </nav>

          {visibleItems.length === 0 ? (
            <div className="customer-empty">
              <h2>No items in this category</h2>
              <p>Please select another category.</p>
            </div>
          ) : (
            <section className="customer-menu-grid">
              {visibleItems.map((item) => (
                <article className="customer-menu-card" key={item._id}>
                  <div className="customer-item-top">
                    <span className="customer-item-dot" />
                    <span className="customer-item-category">
                      {item.category || "Other"}
                    </span>
                  </div>
                  <h3>{item.name}</h3>
                  <div className="customer-item-bottom">
                    <strong>{money(item.price)}</strong>
                    <div className="customer-quantity">
                      <button
                        type="button"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => changeQuantity(item, -1)}
                        disabled={!cart[item._id]}
                      >
                        −
                      </button>
                      <span>{Number(cart[item._id] || 0)}</span>
                      <button
                        type="button"
                        aria-label={`Add one ${item.name}`}
                        onClick={() => changeQuantity(item, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {showCart && (
        <section className="customer-cart-panel">
          <div className="customer-cart-heading">
            <h2>Your cart</h2>
            <button type="button" onClick={() => setShowCart(false)} aria-label="Close cart">
              ×
            </button>
          </div>

          {cartItems.length === 0 ? (
            <p>Your cart is empty. Add some delicious items!</p>
          ) : (
            <>
              <div className="customer-cart-items">
                {cartItems.map((item) => (
                  <div className="customer-cart-row" key={item._id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {money(item.price)} × {item.quantity}
                      </span>
                    </div>
                    <div className="customer-quantity">
                      <button type="button" onClick={() => changeQuantity(item, -1)}>
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(item, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="customer-total">
                <span>Total</span>
                <strong>{money(cartTotal)}</strong>
              </div>

              <div className="customer-payment-options">
                <h3>Choose payment</h3>
                <label>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="UPI"
                    checked={paymentMethod === "UPI"}
                    onChange={() => setPaymentMethod("UPI")}
                  />
                  <span>
                    <strong>Pay by UPI</strong>
                    <small>PhonePe, Google Pay or another UPI app</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="Cash"
                    checked={paymentMethod === "Cash"}
                    onChange={() => setPaymentMethod("Cash")}
                  />
                  <span>
                    <strong>Pay at counter</strong>
                    <small>Pay the restaurant staff at the counter</small>
                  </span>
                </label>
              </div>

              <button
                className="customer-primary-button customer-place-button"
                type="button"
                disabled={placingOrder}
                onClick={placeOrder}
              >
                {placingOrder ? "Placing order…" : `Place order · ${money(cartTotal)}`}
              </button>
            </>
          )}
        </section>
      )}

      {order && (
        <section className="customer-order-panel">
          <div className="customer-order-heading">
            <div>
              <p className="customer-eyebrow">YOUR ORDER</p>
              <h2>Order #{String(order._id).slice(-6).toUpperCase()}</h2>
            </div>
            <span className={`customer-status status-${String(order.status).toLowerCase()}`}>
              {orderCancelled ? "Cancelled" : order.status.replaceAll("_", " ")}
            </span>
          </div>

          <div className="customer-order-details">
            <div>
              <span>Table</span>
              <strong>{order.tableNumber}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money(order.total)}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>{order.paymentMethod === "UPI" ? "UPI" : "Pay at counter"}</strong>
            </div>
            <div>
              <span>Food status</span>
              <strong>{order.fulfillmentStatus || "New"}</strong>
            </div>
          </div>

          <div className="customer-order-items">
            {order.items?.map((item, index) => (
              <div key={`${item.menuItemId || item.name}-${index}`}>
                <span>{item.name} × {item.quantity}</span>
                <strong>{money(Number(item.price) * Number(item.quantity))}</strong>
              </div>
            ))}
          </div>

          {orderCancelled ? (
            <p className="customer-order-note">
              This order was cancelled. Please ask the restaurant staff if you need help.
            </p>
          ) : paymentConfirmed ? (
            <div className="customer-payment-success">
              <strong>Payment successful!</strong>
              <p>Enjoy your food at {restaurantName}!</p>
              <p>Food status: {order.fulfillmentStatus || "New"}</p>
            </div>
          ) : order.paymentStatus === "claimed" ? (
            <div className="customer-order-note">
              Your payment claim has been sent. Please wait while the manager verifies your payment.
            </div>
          ) : order.paymentStatus === "rejected" ? (
            <div className="customer-order-note customer-payment-warning">
              The manager could not confirm this payment. Please check your UPI transaction or contact the staff before retrying.
              {order.paymentMethod === "UPI" && (
                <button
                  className="customer-primary-button"
                  type="button"
                  onClick={openUpiApp}
                >
                  Retry UPI payment
                </button>
              )}
            </div>
          ) : order.paymentMethod === "Cash" ? (
            <div className="customer-order-note">
              Please pay at the counter. The manager will confirm your payment here.
            </div>
          ) : canClaimPayment ? (
            <div className="customer-payment-actions">
              <p>After completing your payment in your UPI app, return here.</p>
              {upiUrl && (
                <button
                  className="customer-secondary-button"
                  type="button"
                  onClick={openUpiApp}
                >
                  Open PhonePe / GPay
                </button>
              )}
              <button
                className="customer-primary-button"
                type="button"
                onClick={claimPayment}
              >
                I've paid
              </button>
              <small>
                Only tap this after paying. The manager must verify the transaction.
              </small>
            </div>
          ) : (
            <div className="customer-order-note">
              Your order is being tracked. Payment status: {order.paymentStatus || "pending"}.
            </div>
          )}

          <button
            className="customer-text-button"
            type="button"
            onClick={refreshOrder}
          >
            Refresh order status
          </button>
          <button
            className="customer-text-button"
            type="button"
            onClick={startNewOrder}
          >
            Start a new order
          </button>
        </section>
      )}

      <footer className="customer-footer">
        Powered by SmartServerHub
      </footer>
    </main>
  );
}
