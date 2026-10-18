
const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    available: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const menuSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      unique: true,
      index: true,
    },

    // Published menu used by the customer QR menu
    categories: {
      type: [String],
      default: [],
    },
    items: {
      type: [menuItemSchema],
      default: [],
    },

    // Menu entered manually
    manualCategories: {
      type: [String],
      default: [],
    },
    manualItems: {
      type: [menuItemSchema],
      default: [],
    },

    // Menu extracted from uploaded photos
    uploadedCategories: {
      type: [String],
      default: [],
    },
    uploadedItems: {
      type: [menuItemSchema],
      default: [],
    },

    // Which source is currently published
    publishMode: {
      type: String,
      enum: ["both", "manual", "uploaded"],
      default: "manual",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Menu", menuSchema);

