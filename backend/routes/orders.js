

const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const PAYMENT_METHODS = ["UPI", "Cash"];
const FOOD_STATUSES = ["New", "Preparing", "Ready", "Served"];

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

function validId(id) {
  return mongoose.isValidObjectId(id);
}

function customerToken(req) {
  return String(req.get("x-customer-token") || "");
}

async function getCustomerOrder(req) {
  const { id } = req.params;
  const token = customerToken(req);

  if (!validId(id) || !/^[a-f0-9]{64}$/i.test(token)) {
    return null;
  }

  const order = await Order.findById(id).select("+customerToken");

  if (!order || !order.customerToken) {
    return null;
  }

  // Tokens are randomly generated, high-entropy secrets.
  if (order.customerToken !== token) {
    return null;
  }

  return order;
}

function buildUpiLink(restaurant, order) {
  const upiId = String(restaurant.upiId || "").trim();

  if (!upiId || !upiId.includes("@")) {
    throw new Error(
      "This restaurant has not configured a valid UPI ID."
    );
  }

  const params = new URLSearchParams({
    pa: upiId,
    pn: restaurant.restaurantName || "Restaurant",
    am: Number(order.total).toFixed(2),
    cu: "INR",
    tn: `Order ${String(order._id).slice(-8)} Table ${order.tableNumber}`,
  });

  return `upi://pay?${params.toString()}`;
}

function publicOrder(order) {
  return {
    _id: order._id,
    restaurantId: order.restaurantId,
    tableNumber: order.tableNumber,
    items: order.items,
    total: order.total,
    paymentMethod: order.paymentMethod,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentAttempt: order.paymentAttempt,
    paidAt: order.paidAt,
    cancellationReason: order.cancellationReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

// ----------------------------------------------------
// CUSTOMER: Create order
// POST /api/orders
//
// Expected body:
// {
//   restaurantId,
//   tableNumber,
//   items: [{ menuItemId, quantity }],
//   paymentMethod: "UPI" | "Cash"
// }
//
// Prices and names are always taken from MongoDB.
// ----------------------------------------------------

router.post("/", async (req, res) => {
  try {
    const {
      restaurantId,
      tableNumber,
      items,
      paymentMethod,
    } = req.body || {};

    if (!validId(restaurantId)) {
      return res.status(400).json({
        message: "A valid restaurant ID is required.",
      });
    }

    const table = Number(tableNumber);

    if (!Number.isInteger(table) || table < 1) {
      return res.status(400).json({
        message: "Invalid table number.",
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({
        message: "Please add between 1 and 50 order items.",
      });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        message: "Choose UPI or Cash / Pay at counter.",
      });
    }

    const [restaurant, menu] = await Promise.all([
      Restaurant.findById(restaurantId).select(
        "_id restaurantName upiId"
      ),
      Menu.findOne({ restaurantId }).lean(),
    ]);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found.",
      });
    }

    if (!menu) {
      return res.status(404).json({
        message: "This restaurant has not published a menu.",
      });
    }

    // Aggregate repeated menu item IDs and validate quantities.
    const quantities = new Map();

    for (const item of items) {
      const menuItemId = String(item?.menuItemId || "");
      const quantity = Number(item?.quantity);

      if (
        !validId(menuItemId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        return res.status(400).json({
          message: "One or more order items are invalid.",
        });
      }

      const key = menuItemId.toLowerCase();
      const nextQuantity = (quantities.get(key) || 0) + quantity;

      if (nextQuantity > 99) {
        return res.status(400).json({
          message: "Maximum quantity per item is 99.",
        });
      }

      quantities.set(key, nextQuantity);
    }

    const publishedItems = menu.items || [];
    const cleanItems = [];

    for (const [menuItemId, quantity] of quantities.entries()) {
      const menuItem = publishedItems.find(
        (item) =>
          String(item._id).toLowerCase() === menuItemId
      );

      if (!menuItem) {
        return res.status(400).json({
          message:
            "A selected food item is no longer on this restaurant's published menu. Please refresh the menu.",
        });
      }

      if (menuItem.available === false) {
        return res.status(400).json({
          message: `${menuItem.name} is currently unavailable.`,
        });
      }

      cleanItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: Number(menuItem.price),
        quantity,
        category: menuItem.category || "Other",
      });
    }

    const total = Number(
      cleanItems
        .reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        )
        .toFixed(2)
    );

    const order = await Order.create({
      restaurantId: restaurant._id,
      tableNumber: table,
      items: cleanItems,
      total,
      paymentMethod,
      status: "placed",
      paymentStatus: "pending",
      fulfillmentStatus: "New",
    });

    return res.status(201).json({
      message: "Order placed successfully.",
      order: publicOrder(order),
      customerToken: order.customerToken,
    });
  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      message: "Unable to place the order.",
    });
  }
});

// ----------------------------------------------------
// CUSTOMER: Start or retry UPI payment
// POST /api/orders/:id/start-payment
// POST /api/orders/:id/retry-payment
// ----------------------------------------------------

async function startPayment(req, res) {
  try {
    const order = await getCustomerOrder(req);

    if (!order) {
      return res.status(404).json({
        message: "Order not found or customer token is invalid.",
      });
    }

    if (order.paymentMethod !== "UPI") {
      return res.status(400).json({
        message: "This order uses Pay at counter.",
      });
    }

    if (["confirmed", "cancelled"].includes(order.status)) {
      return res.status(400).json({
        message: "This order cannot start another payment.",
      });
    }

    if (
      req.path.endsWith("/retry-payment") &&
      order.status !== "rejected"
    ) {
      return res.status(400).json({
        message: "Payment can only be retried after rejection.",
      });
    }

    if (
      req.path.endsWith("/start-payment") &&
      !["placed", "rejected"].includes(order.status)
    ) {
      return res.status(400).json({
        message: "This payment has already been started or claimed.",
      });
    }

    const restaurant = await Restaurant.findById(
      order.restaurantId
    ).select("_id restaurantName upiId");

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found.",
      });
    }

    let upiUrl;

    try {
      upiUrl = buildUpiLink(restaurant, order);
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    order.status = "payment_pending";
    order.paymentStatus = "pending";
    order.paymentAttempt += 1;
    order.paidAt = null;

    await order.save();

    return res.json({
      message: "Payment link is ready.",
      order: publicOrder(order),
      upiUrl,
    });
  } catch (error) {
    console.error("Start payment error:", error);

    return res.status(500).json({
      message: "Unable to start payment.",
    });
  }
}

router.post("/:id/start-payment", startPayment);
router.post("/:id/retry-payment", startPayment);

// ----------------------------------------------------
// CUSTOMER: Claim that UPI payment was attempted
// PATCH /api/orders/:id/claim-payment
// ----------------------------------------------------

router.patch("/:id/claim-payment", async (req, res) => {
  try {
    const order = await getCustomerOrder(req);

    if (!order) {
      return res.status(404).json({
        message: "Order not found or customer token is invalid.",
      });
    }

    if (
      order.paymentMethod !== "UPI" ||
      order.status !== "payment_pending"
    ) {
      return res.status(400).json({
        message: "This order is not awaiting a UPI payment claim.",
      });
    }

    order.status = "paid_claimed";
    order.paymentStatus = "claimed";

    await order.save();

    return res.json({
      message: "Payment submitted for restaurant verification.",
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Claim payment error:", error);

    return res.status(500).json({
      message: "Unable to submit payment claim.",
    });
  }
});

// ----------------------------------------------------
// CUSTOMER: Read order status
// GET /api/orders/:id/customer-status
// ----------------------------------------------------

router.get("/:id/customer-status", async (req, res) => {
  try {
    const order = await getCustomerOrder(req);

    if (!order) {
      return res.status(404).json({
        message: "Order not found or customer token is invalid.",
      });
    }

    return res.json({
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Customer order status error:", error);

    return res.status(500).json({
      message: "Unable to load order status.",
    });
  }
});

// ----------------------------------------------------
// All remaining routes require manager authentication.
// ----------------------------------------------------

router.use(authMiddleware);

// GET /api/orders
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find({
      restaurantId: req.restaurantId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ orders });
  } catch (error) {
    console.error("Load orders error:", error);

    return res.status(500).json({
      message: "Unable to load orders.",
    });
  }
});

// ----------------------------------------------------
// MANAGER: Confirm actual payment
// PATCH /api/orders/:id/payment
// ----------------------------------------------------

router.patch("/:id/payment", async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findOne({
      _id: id,
      restaurantId: req.restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled orders cannot be paid.",
      });
    }

    if (order.paymentStatus === "confirmed") {
      return res.json({
        message: "Payment is already confirmed.",
        order: publicOrder(order),
      });
    }

    // For UPI, require the customer to have submitted a claim.
    // For cash/card at the counter, the manager may confirm
    // directly after receiving the money.
    if (
      order.paymentMethod === "UPI" &&
      order.status !== "paid_claimed"
    ) {
      return res.status(400).json({
        message: "The customer has not submitted a payment claim.",
      });
    }

    order.status = "confirmed";
    order.paymentStatus = "confirmed";
    order.paidAt = new Date();

    await order.save();

    return res.json({
      message: "Payment confirmed successfully.",
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Confirm payment error:", error);

    return res.status(500).json({
      message: "Unable to confirm payment.",
    });
  }
});

// ----------------------------------------------------
// MANAGER: Reject unverified UPI payment
// PATCH /api/orders/:id/reject-payment
// ----------------------------------------------------

router.patch("/:id/reject-payment", async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findOne({
      _id: id,
      restaurantId: req.restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (
      order.paymentMethod !== "UPI" ||
      order.status !== "paid_claimed"
    ) {
      return res.status(400).json({
        message: "Only a claimed UPI payment can be rejected.",
      });
    }

    order.status = "rejected";
    order.paymentStatus = "rejected";
    order.paidAt = null;

    await order.save();

    return res.json({
      message: "Payment claim rejected. Customer may retry payment.",
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Reject payment error:", error);

    return res.status(500).json({
      message: "Unable to reject payment.",
    });
  }
});

// ----------------------------------------------------
// MANAGER: Update food preparation status
// PATCH /api/orders/:id/status
// ----------------------------------------------------

router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    if (!FOOD_STATUSES.includes(status)) {
      return res.status(400).json({
        message: "Invalid food preparation status.",
      });
    }

    const order = await Order.findOne({
      _id: id,
      restaurantId: req.restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled orders cannot be updated.",
      });
    }

    // Do not start preparation until payment is confirmed.
    if (
      ["Preparing", "Ready", "Served"].includes(status) &&
      order.paymentStatus !== "confirmed"
    ) {
      return res.status(400).json({
        message: "Confirm payment before preparing or serving food.",
      });
    }

    order.fulfillmentStatus = status;
    await order.save();

    return res.json({
      message: "Food preparation status updated.",
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Update food status error:", error);

    return res.status(500).json({
      message: "Unable to update food preparation status.",
    });
  }
});

// ----------------------------------------------------
// MANAGER: Cancel order
// PATCH /api/orders/:id/cancel
// ----------------------------------------------------

router.patch("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findOne({
      _id: id,
      restaurantId: req.restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    if (
      ["cancelled"].includes(order.status) ||
      order.fulfillmentStatus === "Served"
    ) {
      return res.status(400).json({
        message: "This order cannot be cancelled.",
      });
    }

    order.status = "cancelled";
    order.cancellationReason = reason;

    await order.save();

    return res.json({
      message: "Order cancelled successfully.",
      order: publicOrder(order),
    });
  } catch (error) {
    console.error("Cancel order error:", error);

    return res.status(500).json({
      message: "Unable to cancel the order.",
    });
  }
});

module.exports = router;
