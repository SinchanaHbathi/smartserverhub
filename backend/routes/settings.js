
const express = require("express");
const multer = require("multer");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return callback(
        new Error("Upload a PNG, JPG, or WEBP image.")
      );
    }

    callback(null, true);
  },
});

// Load settings for the logged-in restaurant
router.get("/", authMiddleware, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found. Please log in again.",
      });
    }

    return res.json({
      upiId: restaurant.upiId || "",
      paymentQrUrl: restaurant.paymentQrUrl || "",
      defaultLanguage: restaurant.defaultLanguage || "en",
    });
  } catch (error) {
    console.error("Load settings error:", error);

    return res.status(500).json({
      message: "Unable to load payment settings.",
    });
  }
});

// Handle upload errors and return JSON
router.put("/", authMiddleware, (req, res, next) => {
  upload.single("paymentQr")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "QR image must be 1 MB or smaller."
          : error.message || "Unable to upload QR image.";

      return res.status(400).json({ message });
    }

    next();
  });
}, async (req, res) => {
  try {
    const upiId = req.body?.upiId;
    const defaultLanguage = req.body?.defaultLanguage;

    if (typeof upiId !== "string" || upiId.trim().length > 150) {
      return res.status(400).json({
        message: "Please enter a valid UPI ID.",
      });
    }

    if (
      defaultLanguage !== undefined &&
      !["en", "hi", "kn"].includes(defaultLanguage)
    ) {
      return res.status(400).json({
        message: "Unsupported language.",
      });
    }

    const restaurant = await Restaurant.findById(req.restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found. Please log in again.",
      });
    }

    restaurant.upiId = upiId.trim();

    // Store the uploaded QR image in MongoDB.
    // If no new image was uploaded, preserve the existing QR.
    if (req.file) {
      const base64 = req.file.buffer.toString("base64");

      restaurant.paymentQrUrl =
        `data:${req.file.mimetype};base64,${base64}`;
    }

    if (defaultLanguage !== undefined) {
      restaurant.defaultLanguage = defaultLanguage;
    }

    await restaurant.save();

    console.log(
      "Payment settings saved for restaurant:",
      restaurant._id.toString()
    );

    return res.json({
      message: "Payment settings saved successfully.",
      upiId: restaurant.upiId || "",
      paymentQrUrl: restaurant.paymentQrUrl || "",
      defaultLanguage: restaurant.defaultLanguage || "en",
    });
  } catch (error) {
    console.error("Save settings error:", error);

    // Log the actual error in the backend terminal.
    return res.status(500).json({
      message:
        error.name === "ValidationError"
          ? "MongoDB validation failed while saving settings."
          : error.name === "DocumentTooLarge" ||
              error.code === 10334
            ? "The saved QR image is too large for MongoDB."
            : "Unable to save payment settings. Check the backend terminal.",
    });
  }
});

module.exports = router;

