
const mongoose = require("mongoose");
const crypto = require("crypto");

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    category: { type: String, default: "Other" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    tableNumber: { type: Number, required: true, min: 1 },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "An order must contain at least one item.",
      },
    },

    total: { type: Number, required: true, min: 0 },

    // Overall order/payment workflow
    status: {
      type: String,
      enum: [
        "placed",
        "payment_pending",
        "paid_claimed",
        "confirmed",
        "rejected",
        "cancelled",
      ],
      default: "placed",
      index: true,
    },

    // Food preparation workflow is independent of payment.
    fulfillmentStatus: {
      type: String,
      enum: ["New", "Preparing", "Ready", "Served"],
      default: "New",
    },

    paymentMethod: {
      type: String,
      enum: ["UPI", "Cash"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "claimed", "confirmed", "rejected"],
      default: "pending",
    },

    paidAt: { type: Date, default: null },

    cancellationReason: { type: String, default: "" },

    // Only the customer possessing this token can read or update
    // the public order status through the customer endpoints.
    customerToken: {
      type: String,
      default: () => crypto.randomBytes(32).toString("hex"),
      select: false,
    },

    paymentAttempt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

orderSchema.index({ restaurantId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);

